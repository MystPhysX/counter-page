// Dependency loading
const config = require("./config");
const { Server } = require("socket.io");
const express = require("express");
const fs = require("fs");
const { createServer } = require("node:http");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const { evaluate, combinations } = require("mathjs");

// Setup the app, server, and sockets
const app = express();
const server = createServer(app);
const io = new Server(server);

// Variables for count tracking
let currentCount = -1;
let currentStatus = "The Next Post Should Be Number";
let interval = null;
let token = null;
let currentCountFound = false;
let clientsConnected = 0;

// Replaces Superscript numbers with ^x
function digitFromSuperscript(superChar) {
    var result = "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(superChar);
    if (result > -1) {
        return result;
    } else {
        return superChar;
    }
}

// Returns a standard int for a subscript number
function digitFromSubscript(superChar) {
    var result = "₀₁₂₃₄₅₆₇₈₉".indexOf(superChar);
    if (result > -1) {
        return result;
    } else {
        return superChar;
    }
}

// Replaces common math symbols with ones mathjs can parse
function replaceSymbols(str) {
    // remove spaces
    let finalStr = str.replaceAll(" ", "");
    finalStr = finalStr.replaceAll(" ", "");
    // replace subtraction
    finalStr = finalStr.replaceAll("−", "-");
    // replace multiplication
    finalStr = finalStr.replaceAll(/x|×|⋅/g, "*");
    // replace division
    finalStr = finalStr.replaceAll("÷", "/");
    // replace superscript
    let superFound = finalStr.search(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g);
    if (superFound != -1) {
        finalStr = [finalStr.slice(0, superFound), "^", finalStr.slice(superFound)].join('');
    }
    finalStr = finalStr.replaceAll(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, digitFromSuperscript);
    return finalStr;
}

// Math pre-parser that decides what to do with text
function mathEvaluation(str) {
    let res = false;
    let subsFound = str.search(/[₀₁₂₃₄₅₆₇₈₉]/g);
    if (str.includes("choose")) {
        // if the text has choose, chances are it's combinations
        let list = str.match(/\d+/g);
        try {
            res = combinations(parseInt(list[0]), parseInt(list[1]));
        } catch {
            res = false;
        }
    } else if (subsFound != -1) {
        // found subscript so we can try changing base
        let subBase = str.slice(subsFound);
        subBase = subBase.replaceAll(/[₀₁₂₃₄₅₆₇₈₉]/g, digitFromSubscript);
        res = parseInt(str.slice(0, subsFound), subBase);
        if (res == NaN) {
            res = false;
        }
    } else {
        // try to evaluate it using the Mathjs evaluate function
        try {
            res = evaluate(replaceSymbols(str));
        } catch {
            res = false;
        }
    }
    return res;
}

// Function that logs and broadcasts if a sequence break was found
function sequenceBreakFound(msg) {
    console.log(msg + " " + currentCount);
    currentStatus = msg;
    io.emit("main text", msg);
    io.emit("current count", currentCount);
}

// Function that checks the passed in number against the current count.
// If it's less than or equal to our current count there's no issues if we haven't already found our current count
// If it's 1 greater than our current count, we're golden
// If it's neither of those, we've found a sequence break
function checkNumber(count) {
    if (count <= currentCount && !currentCountFound) {
        currentCount = count;
        currentCountFound = true;
        return true;
    } else if (count == currentCount + 1 || currentCount == -1) {
        currentCount = count;
        currentCountFound = true;
        return true;
    } else {
        sequenceBreakFound("Sequence Break After Post");
        return false;
    }
}

// oAuth to fetch a token needed for all API accesses
async function fetchToken() {
    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        body: new URLSearchParams({
            grant_type: "password",
            username: config.reddit.usr,
            password: config.reddit.pwd,
        }),
        headers: {
            "User-Agent": "CountWithEveryoneCounter/0.1 (by /u/redskyitm)",
            Authorization: "Basic " + btoa(config.reddit.clientID + ":" + config.reddit.clientSecret),
        },
    });

    const data = await response.json();

    if (response.status == 200) {
        // Got our token
        token = data["access_token"];
        console.log("Access Token Set");
    } else {
        // Didn't get a token
        console.log("Failed to get Access Token. Please restart.");
        return;
    }
}

// Parse through the latest 25 posts to see if there's a sequence break
async function count() {
    // No token, get one
    if (token == null) {
        console.log("Getting new token.");
        await fetchToken();
        count();
        return;
    }
    // Fetch 25 last posts
    const response = await fetch(`https://oauth.reddit.com/r/countwitheveryone/new?limit=${config.reddit.postLimit}`, {
        method: "GET",
        headers: {
            "User-Agent": "CountWithEveryoneCounter/0.1 (by /u/redskyitm)",
            Authorization: "bearer " + token,
        },
    });
    if (response.status == 200) {
        // Received data successfully, process it
        const data = await response.json();
        const posts = data.data.children;
        currentCountFound = false;
        currentCount = -1;
        // Iterate backwards through the array (because it's given to us in descending order)
        for (let i = posts.length - 1; i >= 0; i--) {
            // Skip if post is a distinguished post like an announcement
            if (posts[i].data.distinguished) continue;
            // If the post title is an integer, we can just straight up check it
            if (Number.isInteger(posts[i].data.title)) {
                if (!checkNumber(posts[i].data.title)) return;
            } else {
                // Post title is either math or text. Check math first.
                let res = mathEvaluation(posts[i].data.title);
                if (res) {
                    if (!Number.isInteger(res)) {
                        // Post title was not valid math and is probably text.
                        sequenceBreakFound("Potential Break After The Post Number Below. The Next Post Is Either Text Or Incorrect Math.");
                        return;
                    }
                    // Valid math found, check it.
                    if (!checkNumber(res)) return;
                } else {
                    console.error("Could not evaluate string: " + posts[i].data.title);
                    sequenceBreakFound("Potential Break After The Post Number Below. The Next Post Is Either Text Or Incorrect Math.");
                    return;
                }
            }
        }
        // Everything checked out so we can broadcast the current count and continue in peace.
        currentStatus = "The Next Post Should Be Number";
        io.emit("main text", currentStatus);
        io.emit("current count", currentCount + 1);
    } else {
        let invalidToken = response.headers.get("www-authenticate");
        if (invalidToken && invalidToken.includes("invalid_token")) {
            token = null;
            count();
            return;
        }
    }
}

// Start our count
count();
// Set up the repeating count
interval = setInterval(count, config.app.updateInterval * 1000);

// Default route is to our counter html page
app.use("/", express.static("./static", { index: "counter.html" }));

// Socket handling for all connected clients
io.on("connection", (socket) => {
    clientsConnected++;
    console.log("New client connected. Total: " + clientsConnected);
    socket.emit("main text", currentStatus);
    socket.emit("current count", currentStatus.charAt(0) != "T" ? currentCount : currentCount + 1);
    socket.on("disconnect", () => {
        clientsConnected--;
        console.log("Client disconnected. Total: " + clientsConnected);
    });
    socket.on("math check", (msg) => {
        let res = mathEvaluation(msg);
        if (res) {
            socket.emit("math result", "Result: " + res);
        } else {
            socket.emit("math result", "The counter failed to evaluate your math. Try standard JavaScript operation symbols.");
            return;
        }
    });
});

// Start listening on port specified in config
server.listen(config.app.port, "127.0.0.1", function () {
    console.log(`Listening on http://localhost:${config.app.port}/`);
});
