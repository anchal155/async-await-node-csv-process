var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var AdminGroup = new Schema({
    externalId: {type: String, required: true, unique: true},
    name: String
});

AdminGroup.methods.toClient = function(){
    return {
        id: this._id,
        name: this.name,
        externalId: this.externalId
    };
};

module.exports = mongoose.model('AdminGroup', AdminGroup);