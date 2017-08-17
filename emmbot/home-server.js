const dotenv = require('dotenv').config();
const five = require('johnny-five');
const mqtt = require('mqtt');

let temp_sensor;
let led, led_state;

let board = new five.Board({repl: false,});

let client  = mqtt.connect(process.env.MQTT_SERVER);
const temperature_pub_topic = process.env.UNIQ_TOPIC + "/temperature/ic";
const temperature_meta_topic = process.env.UNIQ_TOPIC + "/temperature/m";
const light_sub_topic = process.env.UNIQ_TOPIC + "/light/ic";
const light_pub_topic = process.env.UNIQ_TOPIC + "/light/oc";

client.on('connect', () => {
    console.log("MQTT Server connected");
	client.subscribe(light_sub_topic);
});

board.on("ready", () => {
	led = new five.Led(process.env.LED_PIN);
	
    temp_sensor = new five.Thermometer({
        controller: 'LM35',
        pin: process.env.TEMP_PIN || "A0",
        freq: process.env.TEMP_FREQUENCY * 1000 || 10000,
    });

    temp_sensor.on("data", (data) => {

        const msg = {
            c: data.celsius,
            ts: Date.now(),
        };

        // use the retain flag to ensure the last value stays behind. This
        // will ensure the bot can always get a value on start up
        client.publish(temperature_pub_topic, JSON.stringify(msg), {retain: true});
        //console.log(msg);
    });
});

client.on('message', (topic, message) => {

    // message is Buffer
    console.log(topic, message.toString());
    let state = message.toString();

    if (state == "on") {
        led.on()
    } else if (state == "off") {
        led.off();
    }

    // publish current state to the output content topic
    client.publish(light_pub_topic, state);
});


