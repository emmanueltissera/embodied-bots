const dotenv = require('dotenv').config();
const  mqtt = require('mqtt');

// do quick check on whether number is valid or not
if (! /^\+?(0|[1-9]\d*)$/.test(process.argv[2])) {
    console.log("Please use a proper number");
    process.exit(0);
}

let client = mqtt.connect(process.env.MQTT_SERVER);

const topic = process.env.UNIQ_TOPIC;

client.on('connect', () => {

    const msg = {
        c: process.argv[2],
        ts: Date.now(),
    };

    client.publish(topic + "/temperature/ic", JSON.stringify(msg));
    console.log("Temperature Message sent to server");
	
	if (process.argv[3] == "on") {
        client.publish(topic + "/light/ic", "on");
    } else if (process.argv[3] == "off") {
        client.publish(topic + "/light/ic", "off");
    }

    console.log("Light Message sent to server");
    client.end();
});


