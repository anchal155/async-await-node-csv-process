var csv = require('csv');
var fs = require('fs');
var moment = require('moment-timezone');
var middleware = require('./middleware');
var constants = require('./middleware/constants');
var path = require('path');
var models = require('./middleware/models');
var AdminGroup = models.AdminGroup;
var logger = middleware.logger('index');
var uuid = require('uuid');
var config = require('./middleware/config');
var isProcessingCompleted = false;

//Admin group repo save function....
function save(adminGroup, callback){
    logger.info('going inside save function');
    logger.info('this is newAdminGroup'+ adminGroup);
    var newAG = new AdminGroup(adminGroup);
    newAG.save(function(err, result){
        if(err){
            logger.error('An error occured while calling the save method ' + err.message);
            return callback(err);
        }else{
            return callback(err, result)
        }
    });
};

//Admin group repo indexAdminGroupByExternalIdfunction....
function getAdminGroupByExternalId(externalId, callback){
    AdminGroup.findOne({externalId: externalId}, function(err, adminGroup){
        if(err){
            logger.error('An error occured while finding the document');
            return callback(err);
        }else{
            logger.info('The admin group found successfully');
            return callback(err, adminGroup);
        }
    });
} 

//Validating File....
function validFile(fileName) {
    const validFileExtensions = constants.VALID_ELIGIBILITY_EXTENSIONS;
    if (new RegExp('(' + validFileExtensions.join('|').replace(/\./g, '\\.') + ')$', 'i').test(fileName) === true) {
      return true;
    } else {
      logger.error('Invalid File - ' + fileName);
      return;
    }
}

//Connecting to database.....
async function connectToDb() {
    if (middleware.readyState() === constants.MONGOOSE.READYSTATES.DISCONNECTED.name) {
      try {
        const db = await middleware.connect(config.config.mongo.uri, config.config.mongo.options);
        console.log('Mongo db has connected successfully');
        return db;
      } catch (err) {
        throw new Error('Error connecting to mongo: ' + err);
      }
    }
    return null;
}

//Saving user data to the database....
var recordUserData = async function(db, bulkOps, user){
    user.firstName = user.firstName.trim().toUpperCase();
    user.lastName = user.lastName.trim().toUpperCase();
    user.middleInitial = user.middleInitial.trim().toUpperCase();
    var middleString = '';
    var now = moment().tz('America/New_York');
    var cnt = 0;
   
    if(user.middleInitial && user.middleInitial.length > 0){
        middleString = ' ' + user.middleInitial.toLowerCase() + ' ';
    }
    user.searchName = user.firstName.toLowerCase() + middleString + user.lastName.toLowerCase();
    user.email = (user.firstName.replace(/\s+/g, '_') + '.' + user.lastName.replace(/\s+/g, '_') + '@humana.com').toLowerCase();
    user.terminated = false;
    user.dateTerminated = null;

    logger.info('The user created is ' + JSON.stringify(user));

    db.collection('users').countDocuments({alternateId: user.alternateId, terminated: false}, function(err, cnt){
        if(err){
            return err;
        }else{
            verifyCount(cnt, user, bulkOps, now); 
        }
    });
    await verifyCount(cnt, user, bulkOps, now);
   
}

//Verify count and inserting and updating user....
var verifyCount = async function(cnt, user, bulkOps, now){
    if(cnt == 0){
        logger.info('The count is 0');
        user._id = uuid.v4();
        user.dataAdded = now.toDate();
        bulkOps.insert(user);    
        logger.info('The data is inserted succesfully');  
    }else{
        bulkOps.find({ alternateId: user.alternateId }).updateOne({ $set: user });
        logger.info('The data has been updated successfully');
    } 
}

//Main processing file function.......
async function processEligibilityFile(filePath) {
    const db = await connectToDb();
    logger.info( 'The db value is ' + db);
    var csvStream = fs.createReadStream(filePath).pipe(
        csv.parse({delimiter: '|', from_line: 2})
    );
    var bulkOps = null;
    var currentOperation = null;
    var currentCount = 0;
    var totalCount = 0;
    var mongobulkOptions = {w:2};

    csvStream.on('data', async function(row){
        //validating file
        var ValidateFile = validFile(filePath);
        if(ValidateFile){
            logger.info('File has been validated Successfully...');
        }
        if(row && row.length) {
            logger.info('This is row from the file ' + row);
            switch(row[0]) {
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
                                currentOperation = constants.ELIGIBILITY_FILE.CHANGE_INDICATOR_TYPES.ADD.name;
                                totalCount += currentCount;
                                currentCount = 0;
                                bulkOps.execute(mongobulkOptions, function(err){
                                    if(err){
                                        logger.error('An error occured in execution process '+ err.message);
                                        return err;
                                    }else{ 
                                        logger.info('Bulk Add - Total Processed = ' + totalCount);
                                        process.exit();
                                    }
                                })
                            }

                            currentCount++;

                            //Get Admin group by external Id
                            getAdminGroupByExternalId(user.adminGroups[0], function(err, adminGroup){
                                if(err){
                                    return err;
                                }else{
                                    if(!adminGroup){
                                        logger.info('Admin group is null hence saving it...');

                                        //saving admin group.....
                                        save({externalId: user.adminGroups[0], name: 'TEMP_' + user.adminGroups[0]}, function(err, newAdminGroup){
                                            user.adminGroups = [newAdminGroup];
                                            logger.info('The user is saved successfully '+ newAdminGroup);   
                                            recordUserData(db, bulkOps, user);
                                        });
                                    }else{
                                        user.adminGroups = [adminGroup];
                                        logger.info('User already existing hence the admin group is ' + user.adminGroups[0]);
                                        recordUserData(db, bulkOps, user);
                                    }
                                }
                            });
                            await recordUserData(db, bulkOps, user);  
                        default:
                    }       break;
                default:
                    break;
            }
        }
    });
    csvStream.on('error', function(err){
        if(err){
            logger.info('An error occured while streaming the process ' + err.message);
            process.exit(err);
        }
    });
    csvStream.on('end', async function(){
        logger.info('The length of the bulkOps is' + bulkOps.length);
        logger.info('The current count is ' + currentCount);
        if(bulkOps.length > 0 && bulkOps.batchSize === 0){
            logger.info('Execute method has already been called');
            bulkOps.execute(mongobulkOptions);
            bulkOps = await db.collection('users').initializeUnorderedBulkOp();
            isProcessingCompleted = true;
        }else{
            bulkOps = await db.collection('users').initializeUnorderedBulkOp();
            isProcessingCompleted = true;
        }
    });
}

//Calling function
processEligibilityFile(path.join(__dirname  + '/') + 'users_20230405.txt').then(function(){
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
    }, 5000);
    })
    .catch(function(Err){
        console.error(Err.message);
        process.exit(1);
    });




    





