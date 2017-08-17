'use strict';
const cleverbot = require('cleverbot.io');
// .slice(2) removes the first 2 arguments, which are the nodejs executable path, and the filename
let input = process.argv.slice(2).join(' ');
let bot = new cleverbot('PPQMMhFMMZXUKMwE', 'dAc6JkJrWTNMpe1AwHTlHzWcDDj7x9Ha');
bot.setNick('Vlad');
bot.create(function (err, session) {
    bot.ask(input, function (err, response) {
        console.log(session + ':', response)
    });
});