var winston = require('winston');
var _ = require('underscore');

module.exports = function(name){
    var transports = [];

    var minLoggerConfig = {
        level: 'debug',
        colorsize: true,
        timestamp: true,
        json: false,
        label: name
    };

    var newConfig = _.extend(minLoggerConfig, 'debug');
    transports.push(new(winston.transports.Console)(newConfig));

    var logger = winston.loggers.add(name, {
        transports: transports
    });
    return logger;
}