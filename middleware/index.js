var mongoose = require('mongoose');
exports.constants = require('./constants');
exports.Types = mongoose.Types;
exports.logger = require('./logger');
exports.models = require('./models');
exports.config = require('./config');

exports.connect = function(uri, options){
    console.log('inside mongo connect function');
    return new Promise(function(resolve, reject) {
        mongoose.connect(uri, options)
          .then(function() {
            console.log('Successfully connected to mongo');
            resolve(mongoose.connection);
          })
          .catch(function(err) {
            console.log('Mongoose Connection error: ' + err.message ? err.message : err);
            reject('Mongoose Connection error: ' + err.message ? err.message : err);
          });
    });
};

exports.disconnect = function(callback){
    return mongoose.disconnect(callback);
};

exports.readyState = function(){
    return mongoose.connection.readyState;
};

exports.mongooseConnection = function(){
    return mongoose.connection;
};

exports.close = function(callback){
    return mongoose.close(callback);
}
