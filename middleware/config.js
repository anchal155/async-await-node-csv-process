module.exports.config = {
    mongo : {
        uri: 'mongodb+srv://adminuser:admin1234@demo-vue-cluster.peyk2ih.mongodb.net/node-hm-db?retryWrites=true&w=majority',
        options: {
        useNewUrlParser: true,
        maxPoolSize: 48,
        keepAlive: true,
        w: 2
        }
    }
};
    



