var csv = require('csv');
var fs = require('fs');
var path = require('path');
var moment = require('moment-timezone');
var middleware = require('./middleware');
var constants = require('./middleware/constants');
var path = require('path');
var models = require('./middleware/models');
var AdminGroup = models.AdminGroup;
var logger = middleware.logger('index');
var uuid = require('uuid');
var config = require('./middleware/config');

var bulkOps = null;
var currentCount = 0;
var isProcessingCompleted = false;

// Valid File...
function validFile(fileName) {
    const validFileExtensions = constants.VALID_ELIGIBILITY_EXTENSIONS;
    if (new RegExp('(' + validFileExtensions.join('|').replace(/\./g, '\\.') + ')$', 'i').test(fileName) === true) {
      return true;
    } else {
      logger.error('Invalid File - ' + fileName);
      return false;
    }
}

//Connecting to database.....
async function connectToDb() {
    var db = null;
    if (middleware.readyState() === constants.MONGOOSE.READYSTATES.DISCONNECTED.name) {
        try{
            db = await middleware.connect(config.config.mongo.uri, config.config.mongo.options);
            console.log("Mongo db has connected successfully");
            return db;
        }catch (err) {
            throw new Error('Error connecting to mongo: ' + err);
        }
    }
    else{
        db = middleware.mongooseConnection();
        return db;
    } 
}

//Processing csv file using async/await
var eligibility = async function (row, db, mongobulkOptions) {
    var now = moment().tz('America/New_York');
    var currentOperation = null;
    var totalCount = 0;
    if(row && row.length) {
        logger.info('This is row from the file ' + row);
        switch(row[0]){
            case constants.ELIGIBILITY_FILE.RECORD_TYPES.DETAIL.name:
                var user = {
                    alternateId: row[5],
                    firstName: row[2],  
                    middleInitial: row[3],
                    lastName: row[4],
                    adminGroups: [row[6]],
                    subscriberId: row[7] ? row[7] : '',
                    employeeIndicator:row[8] ? row[8]: ''
                };
                logger.info('this is user record: ' + JSON.stringify(user));

                switch(row[1]) {
                    case constants.ELIGIBILITY_FILE.CHANGE_INDICATOR_TYPES.ADD.name:
                        if(!bulkOps){
                            logger.info('Bulk Ops is initializing...');
                            bulkOps = await db.collection('users').initializeUnorderedBulkOp();
                            logger.info('The value of bulk Ops is ' + bulkOps);
                        }
                        if (!currentOperation) {
                            logger.info('this is currentOperation' + currentOperation);
                            currentOperation = constants.ELIGIBILITY_FILE.CHANGE_INDICATOR_TYPES.ADD.name;
                            logger.info('Current Operation is initialized ' + currentOperation);
                        }
                        if((currentOperation !== constants.ELIGIBILITY_FILE.CHANGE_INDICATOR_TYPES.ADD.name)|| (currentCount >= constants.ELIGIBILITY_FILE.ELIGIBILITY.BATCH_SIZE)){
                            logger.info('Inside if condition');
                            currentOperation = constants.ELIGIBILITY_FILE.CHANGE_INDICATOR_TYPES.ADD.name;
                            totalCount += currentCount;
                            currentCount = 0;
                            bulkOps.execute(mongobulkOptions);
                            logger.info('The batch execution happened successfullly');
                            process.exit();
                        }
                        currentCount++;
                        logger.info('The current operation is equal to A');
                        var adminGroup = await AdminGroup.findOne({externalId: user.adminGroups[0]});
                        var newAG = new AdminGroup({externalId: user.adminGroups[0], name: 'TEMP_' + user.adminGroups[0]});
                        logger.info('adminGroup is ' + adminGroup);
                        if(!adminGroup){
                            logger.info('Admin group is null hence saving it...');
                            var newAdminGroup = await newAG.save();
                            logger.info('Admin group is saved successfully and the new admin group is ' + newAdminGroup);
                            user.adminGroups = [newAdminGroup];
                        }else{
                            logger.info('admin group is already in the database ' + adminGroup);
                            user.adminGroups = [adminGroup];
                        }

                        user.firstName = user.firstName.trim().toUpperCase();
                        user.lastName = user.lastName.trim().toUpperCase();
                        user.middleInitial = user.middleInitial.trim().toUpperCase();
                        var middleString = '';
                        if(user.middleInitial && user.middleInitial.length > 0){
                            middleString = ' ' + user.middleInitial.toLowerCase() + ' ';
                        }
                        user.searchName = user.firstName.toLowerCase() + middleString + user.lastName.toLowerCase();
                        user.email = (user.firstName.replace(/\s+/g, '_') + '.' + user.lastName.replace(/\s+/g, '_') + '@humana.com').toLowerCase();
                        user.terminated = false;
                        user.dateTerminated = null;

                        logger.info('The user created is ' + JSON.stringify(user));
                        const count = await db.collection('users').countDocuments({alternateId: user.alternateId, terminated: false});
                        if(count === 0){
                            logger.info('The count of counting document is 0');
                            user._id = uuid.v4();
                            user.dataAdded = now.toDate();
                            bulkOps.insert(user);
                            logger.info('The user with alternateId ' + user.alternateId + ' is inserted successfully');
                        }else{
                            bulkOps.find({alternateId: user.alternateId}).updateOne({$set: user});
                            logger.info('The user with alternateId ' + user.alternateId + ' is updated successfully');
                        }
                        break;
                    default:
                        break;
                }
            
            default:
                break;
        }
    }
    
}

// Main function....
var processEligibilityFile = async function(filePath) {
    var db = await connectToDb();
    var mongobulkOptions = {w:2};
    var validateFile = validFile(filePath);
    if(validateFile){
        logger.info('File has been validated Successfully...');
    }
    var add = new Promise(function(resolve, reject){
        const promises = [];
        fs.createReadStream(filePath)
        .pipe(csv.parse({delimiter: '|', from_line: 2}))
        .on("data", function(row){
            promises.push(eligibility(row, db, mongobulkOptions));
        })
        .on("error", reject)
        .on("end", async function() {
            logger.info('process end successfully with the count ' + currentCount);
            await Promise.all(promises);
            if(bulkOps.length > 0) {
                bulkOps.execute(mongobulkOptions);
                logger.info('The execution happened successfully...');
                resolve();
                isProcessingCompleted = true;
            }else{
                logger.info('The length is 0 of bulkOps... No Operation to execute');
            }
        });
    });
    return add;
}

if(process.argv && process.argv.length && process.argv[1]){
    processEligibilityFile(path.join(__dirname  + '/') + 'users_20230408.txt').then(function(){
        const intervalId = setInterval(function(){
            if(isProcessingCompleted){
                clearInterval(intervalId);
                logger.info('File has been processed successfully...');
                middleware.disconnect(function(err){
                    if(err){
                        logger.error(err.message);
                        process.exit(err);
                    }else{
                        logger.info('The Database has been disconnected successfully');
                    }
                    process.exit(0);
                });
            }
        }, 3000);
        })
        .catch(function(Err){
            console.error(Err.message);
            process.exit(1);
        });
}else{
    var local = async.queue(processEligibilityFile, 1);
}
