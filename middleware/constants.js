module.exports.ELIGIBILITY_FILE = {
        RECORD_TYPES :{
            HEADER: {
                name: 'H'
            },
            DETAIL:{
                name: 'D'
            },
            TRAILER: {
                name: 'T'
            }
        },
        CHANGE_INDICATOR_TYPES:{
            ADD:{
                name: 'A'
            },
            CHANGE:{
                name:'C'
            },
            TERM: {
                name: 'T'
            }
        },
        INDEXES: {
            recordType: 0,
            changeIndicator: 1,
            firstName: 2,
            middleInitial: 3,
            lastName: 4,
            memberGenKey: 5,
            employerGroupId: 6,
            subscriberId: 7,
            employeeIndicator: 8
        },
        ELIGIBILITY:{
            BATCH_SIZE: 1000
        },
};
module.exports.VALID_ELIGIBILITY_EXTENSIONS = ['txt']
module.exports.MONGOOSE = {
    READYSTATES: {
        DISCONNECTED: {
            name: 0
        },
        CONNECTED: {
            name: 1
        },
        CONNECTING: {
            name: 2
        },
        DISCONNECTING: {
            name: 3
        }
    }
};

