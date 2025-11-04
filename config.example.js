const config = {
    app: {
        port: 3010, // default port to listen on
        updateInterval: 30, // in seconds
    },
    reddit: {
        usr: "username", // reddit username
        pwd: "password", // reddit password
        clientID: "app client id", // reddit app client id
        clientSecret: "app secret", // reddit app client secret
        postLimit: 25, // how many posts to fetch for counting in the range of 25-100
    },
};

module.exports = config;
