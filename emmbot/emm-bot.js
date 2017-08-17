'use strict';

const Botkit = require('Botkit');
const dotenv = require('dotenv').config();
const moment = require('moment');
const mqtt = require('mqtt');
const Quiche = require('quiche');
const cleverbot = require("better-cleverbot-io");

const EmotionalModel = require('./lib/emotion');

let ledstate, discoState, heatState;
let temp_data = [];
let current_temp = { min: null, max: null};

let notify_users = [];

// create bot's emotions and give it a pretty high positivity
// score so it tends towards positive sides of the PAD cube
let bot_emotions = new EmotionalModel({ positivity: 0.9 });

// we only care about hours.
let bot_time = (new Date()).getHours();

// set our preferred temperature range
const preferred_temp = { min: 18.0, max: 22.0 };

let client  = mqtt.connect(process.env.MQTT_SERVER)
const temperature_sub_topic = process.env.UNIQ_TOPIC + "/temperature/ic";
const light_sub_topic = process.env.UNIQ_TOPIC + "/light/oc";
const light_pub_topic = process.env.UNIQ_TOPIC + "/light/ic";

const topics = [temperature_sub_topic, light_sub_topic];
client.on('connect', function () {
    console.log("Listening for topics " + topics);
    client.subscribe(topics);
});

client.on('message', function (topic, message) {	
	if(topic === temperature_sub_topic){
		recordTemperature(message);
	}
	else if(topic === light_sub_topic){
		switchLight(message);
	}
});

function recordTemperature(message){
	// message is Buffer
    let msg = JSON.parse(message.toString());

    // handle new data
    temp_data.push(msg);

    if (msg.c < current_temp.min || current_temp.min === null) {
        current_temp.min = msg.c;
    }
    if (msg.c > current_temp.max || current_temp.max === null) {
        current_temp.max = msg.c;
    }

    current_temp.c = msg.c;
    current_temp.ts = msg.ts;
}

function switchLight(message){
	 // message is Buffer
    let state = message.toString();
    let newstate = null;

    if (state == "light-on") {
        newstate = true;
    } else if (state == "light-off") {
        newstate = false;
    }
    console.log("LED state", state);

    if (newstate != ledstate) {
        console.log("It changed remotely!! Bastards!");

        notify_users.forEach((user) => {
            bot.startPrivateConversation({user: user}, (err, convo) => {

                convo.say(`Just to let you know, the light was switched *${state}*`);
                convo.next();
            });
        });
    }

    ledstate = newstate;
}

var smartBot = new cleverbot({user:process.env.CLEVERBOT_APIUSER, key:process.env.CLEVERBOT_APIKEY, nick:'EmBot'});
smartBot.create().then(() => {
    console.log('cleverbot create success.');
}).catch(err => {
	console.log('cleverbot create fail.');
});

var botcontroller = Botkit.slackbot({
	debug: process.env.APP_DEBUG || false,
});

const config = {
	token: process.env.SLACK_TOKEN,
};

let bot = botcontroller.spawn(config).startRTM((err, bot, payload) => {
    if (err) {
        throw new Error(err);
    }
    console.log("Now online");
});

const channels = ['direct_message', 'direct_mention', 'mention'];

botcontroller.hears(['hello', 'hi', 'yo ', 'hey'], channels, (bot, message) => {

    let user = `<@${message.user}>`;

    // set up the replies based on model responses
    let replies = {
        "excited": `Hi ${user}! :smile: I am so happy to see you today!`,
        "curious": `Hello ${user}, how are you today?`,
        "relaxed": `Hi ${user}`,
        "sleepy": `_yawn_ Hi ${user} :zzz:`,
        "angry": `What do you want, ${user}? :angry:`,
        //"angry": `Seriously, I'm working here - what do you want, ${user}? :angry:`,
        "frustrated": `:weary: Can I help you?`,
        "indifferent": `Hey...`,
        "bored": `Hey there`,
    };

    let response = replies[bot_emotions.emotion()];

    bot.reply(message, response);
});


botcontroller.hears(['how are you', 'emotion'], channels, (bot, message) => {

    let user = `<@${message.user}>`;
	let emotion = bot_emotions.emotion();
	let response = `Hi ${user}! My current emotion is: ${emotion}`;
	
	bot.reply(message, response);
});

botcontroller.hears(['settime'], ['direct_message'], (bot, message) => {

    // message is "settime XX" where XX is a 24 hour time for the bot/
    let [settime, time ] = message.text.split(" ");

    // we set the bot's internal time so we can use it later.
    bot_time = parseInt(time);

    bot.reply(message, "Time now set to " + bot_time);
});

botcontroller.hears(['current state'], ['direct_message'], (bot, message) => {
    bot.reply(message, "My current state is: `" + bot_emotions.state() + "`");
});

botcontroller.hears(['current emotion'], ['direct_message'], (bot, message) => {
    bot.reply(message, "My current emotion is: " + bot_emotions.emotion());
});

botcontroller.hears(['current temp', 'temperature', 'weather'], channels, (bot, message) => {
	let r = get_temp_message(temp_data);

    bot.replyWithTyping(message, r);
    bot.reply(message, "My current temperature is: " + current_temp.c);
});

botcontroller.hears(['light(.?) on', 'on(.?) the light(.?)'], channels, (bot, message) => {

    ledstate = true;
	SendOnReply(bot, message, "light-on");
});

botcontroller.hears(['disco on', 'on(.?) the disco(.?)', 'party start', 'start(.?) the party'], channels, (bot, message) => {
    discoState = true;
	SendOnReply(bot, message, "disco-on");
});

botcontroller.hears(['heat on','heater on','make it hot'], channels, (bot, message) => {
    heatState = true;
	SendOnReply(bot, message, "heater-on");
});

function SendOnReply(bot, message, instruction){
	client.publish(light_pub_topic, instruction);
	
	let user = `<@${message.user}>`;
    let replies = [
        `There you go ${user}`,
        `If that's what you'd like me to do`,
        `I am here just to switch your lights on and off, ${user}`,
        `If I'm passing, ${user}, I'll give them a flick.`,
    ];

    let response = replies[Math.floor(Math.random() * replies.length)];

    bot.reply(message, response);
}

botcontroller.hears(['light(.?) off', 'off(.?) the light(.?)'], channels, (bot, message) => {
    ledstate = false;
	SendOffReply(bot, message, "light-off");
});

botcontroller.hears(['disco off', 'off(.?) the disco(.?)', 'party stop', 'stop(.?) the party'], channels, (bot, message) => {
    discoState = false;
	SendOffReply(bot, message, "disco-off");
});

botcontroller.hears(['heat off','heater off','make it cold'], channels, (bot, message) => {
    heatState = false;
	SendOffReply(bot, message, "heater-off");
});

function SendOffReply(bot, message, instruction){
	client.publish(light_pub_topic, instruction);

    let user = `<@${message.user}>`;
    let replies = [
        `Sure thing.`,
        `No worries ${user}`,
        `If that's what you'd like me to do`,
        `I am here just to switch your lights on and off, ${user}`,
    ];

    let response = replies[Math.floor(Math.random() * replies.length)];

    bot.reply(message, response);
}

botcontroller.hears(['light(.?)$'], channels, (bot, message) => {
    bot.startConversation(message, (err, convo) => {

        // first we look at what state the LED is in.
        let state = ledstate ? "on" : "off"; // what is LED currently
        let question_state = ledstate ? "off" : "on"; // what do we ask about

        // add a timeout option
        convo.setTimeout(15000);
        convo.onTimeout((convo) => {
            convo.say(`I'll leave the light ${state}. Just let me know if you want to change it`);
            convo.next();
        });

        // now ask what to do
        convo.ask(`The light is currently *${state}*. Do you want me to turn it ${question_state}?`,
        [{
            pattern: bot.utterances.yes,
            callback: (response, convo) => {
                if (ledstate) {
                    client.publish(light_pub_topic, "light-off");
                } else {
                    client.publish(light_pub_topic, "light-on");
                }
                ledstate = !ledstate;
                convo.say(`Okay, the light is now ${question_state}.`);
                convo.next();
            }
        },{
            pattern: bot.utterances.no,
            default: true,
            callback: (response, convo) => {
                convo.say('Cool. I\'ll leave it as it is');
                convo.next();
            }
        }] );
    });
});

botcontroller.hears(['notify me'], channels, (bot, message) => {

    let user = message.user;

    bot.startConversation(message, (err, convo) => {

        convo.say("I can notify you if someone changes the lights remotely.");

        convo.ask("Would you like me to activate that now?",
        [{
            pattern: bot.utterances.yes,
            callback: (response, convo) => {

                if (notify_users.includes(user)) {
                    convo.say("You were already on the list.");
                } else {
                    notify_users.push(user);
                    convo.say("Great. I've added you to the notification list.");
                }

                console.log(notify_users);

                convo.say("If someone changes the status I'll DM you");
                convo.next();
            },
        },{
            pattern: bot.utterances.no,
            callback: (response, convo) => {
                if (notify_users.includes(user)) {
                    let index = notify_users.indexOf(user);
                    notify_users.splice(index, 1);
                    convo.say("I've removed you from the list");
                } else {
                    convo.say("No problems, just let me know if you want to at any time");
                }

                convo.next();
            },
        }] );
    });
});

botcontroller.hears([''],channels, (bot,message) => {  
	SendCleverLocalReply(bot, message);
    //SendCleverBotIoReply(bot, message);
});

function SendCleverBotIoReply(bot, message){
	var msg = message.text;
	bot.replyWithTyping(message,"");
	smartBot.ask(msg).then((response => {
		bot.reply(message, response);
	})).catch(err => {
		bot.reply(message, "Cleverbot Exception: " + err);
	})
}

function SendCleverLocalReply(bot, message){
	
	let user = `<@${message.user}>`;	
    let dunno_replies = [
        `Dunno ${user}`, 
		`I have no idea ${user}`, 
		`I haven't a clue ${user}`, 
		`${user}, I haven't the faintest idea`, 
		`How should I know ${user}?`, 
		`Don't ask me`, 
		`Search me`, 
		`Who knows?`, 
		`It's anyone's guess`, 
		`${user}, Your guess is as good as mine`, 
		`Not as far as I know ${user}`, 
		`It beats me`, 
		`${user}, This is what I know, and I will have more information for you soon.`, 
		`${user}, I'm not the right person to ask about this, let's find out who can answer your question.`, 
		`${user}, I hear your concern, so give me an opportunity to get the right answer for you.`
    ];
	
	let function_replies = [
		"`hello`, `hi`, `yo `, `hey` to greet me", 
		"`how are you`, `emotion` to find my emotional state", 
		"`current temp`, `temperature`, `weather` to find out the current temperature in the house", 
		"`light on`, `on the light`, `lights on`, `on the lights` to switch the lights on in the house", 
		"`disco on`, `on the disco`, `party start`, `start the party` to switch on some disco lights in the house", 
		"`heat on`,`heater on`,`make it hot` to turn the heater on in the house", 
		"`light off`, `off the light`, `light off`, `off the light` to switch the lights off in the house", 
		"`disco off`, `off the disco`, `party stop`, `stop the party` to switch off the disco lights in the house", 
		"`heat off`,`heater off`,`make it cold` to turn the heater off in the house", 
		"`light`, `lights` to find out the current status of the lights and maybe switch it on or off", 
		"`notify me` to get a direct message when someone else switches the lights on or off"
	];

    let dunno_response = dunno_replies[Math.floor(Math.random() * dunno_replies.length)];
	let function_response = function_replies[Math.floor(Math.random() * function_replies.length)];
	let response = dunno_response + " :confused: \nI can do some cool stuff though. Try " + function_response;

    bot.reply(message, response);
}

function update_emotions() {
    // go through emotion updating process.
    //
    let tmp_emotions = bot_emotions.state();

    if (bot_time < 7) {
        bot_emotions.negative("arousal");
    } else if( bot_time >= 7 && bot_time <= 10) {
        bot_emotions.neutral("arousal");
    } else if ( bot_time >= 11 && bot_time <= 15 ) {
        bot_emotions.positive("arousal");
    } else if (bot_time >= 16 && bot_time <= 21 ) {
        bot_emotions.neutral("arousal");
    } else {
        bot_emotions.negative("arousal");
    }

    // now test the temperature
    if (isNaN(current_temp.c)) {
        bot_emotions.positive("pleasure");
        bot_emotions.negative("dominance");
    } else if (current_temp.c < preferred_temp.min) {
        bot_emotions.neutral("pleasure");
        bot_emotions.negative("dominance");
    } else if (current_temp.c > preferred_temp.max) {
        bot_emotions.negative("pleasure");
        bot_emotions.positive("dominance");
    } else {
        bot_emotions.positive("pleasure");
        bot_emotions.neutral("dominance");
    }

    if (tmp_emotions !== bot_emotions.state()) {
        console.log("Updating emotions", bot_emotions.state());
    }
}

// set up a loop that runs periodically to update the internal state of the
// bot based on current time and temperature
let interval = setInterval(() => {
    update_emotions();

}, process.env.BOT_EMOTION_UPDATE * 1000);



const get_temp_message = (data, opts) => {
    // get the data, iterate over it and apply any constraints
    // then return something formatted as a message to use

    let options = opts || {};

    const w = 400;
    const h = 250;
    const max_pts = 40;

    // make up an image chart from text strings
    let lc = new Quiche('line');
    lc.setHostname('image-charts.com');
    lc.setWidth(w);
    lc.setHeight(h);
    lc.setAutoScaling();
    lc.setLegendHidden(true);
    lc.setTitle(options.title || "Historical Temperature C");

    let data_pts = [];
    let times = [];

    data.forEach((dp, i) => {

        // check to see if this point is inside a moving window of points
        // this is so the chart only shows `max_pts` worth of data.
        let add_pt = false;
        if (data.length > max_pts) {
            if (i > data.length - max_pts) {
                add_pt = true;
            }
        } else {
            add_pt = true;
        }

        if (add_pt) {
            data_pts.push(dp.c);
            if (i % 6 == 0) { // todo choose appropriate number here
                let t = new moment(dp.ts);
                times.push(t.format("HH:mm:ss"));
            } else {
                times.push(""); // add blanks when not needed.
            }
        }
    });

    lc.addData(data_pts, "temp(c)", "ede63e");
    lc.addAxisLabels('x', times);

    const temp_url = lc.getUrl(true);

    const min = current_temp.min || "-";
    const max = current_temp.max || "-";

    // data commented out below simply to highlight possible options for
    // attachment - see https://api.slack.com/docs/message-attachments for more
    let msg_data = {
        token: process.env.SLACK_TOKEN,
        //channel: '#channelname',
        text: "Here is the recent temperature data I could find:",
        as_user: true,
        "attachments": [
            {
                "fallback": "Recent temperature data ",
                "color": "#ede63e",
                //"pretext": "Optional text that appears above the attachment block",
                //"author_name": "Bobby Tables",
                //"author_link": "http://flickr.com/bobby/",
                //"author_icon": "http://flickr.com/icons/bobby.jpg",
                //"title": "Here is the recent temperature data",
                //"title_link": "https://api.slack.com/",
                //"text": "Optional text that appears within the attachment",
                "fields": [
                    {
                        "title": "Current",
                        "value": current_temp.c + "˚C",
                        "short": true
                    },
                    {
                        "title": "Min / Max",
                        "value": min + "˚C / " + max + "˚C",
                        "short" : true,
                    },
                ],
                "image_url": temp_url,
                //"thumb_url": temp_url,
                //"footer": "Slack API",
                //"footer_icon": "https://platform.slack-edge.com/img/default_application_icon.png",
                "ts": Math.floor(current_temp.ts / 1000),
            }
        ]
    };

    return msg_data;

}


console.log("Initialising emotional state");
update_emotions();

