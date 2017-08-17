const dotenv = require('dotenv').config();
const five = require('johnny-five');
const mqtt = require('mqtt');

let temp_sensor;
let led, rgb, heater;
let disco_on, heater_on, heat_rising;

let board = new five.Board({repl: false,});

let client  = mqtt.connect(process.env.MQTT_SERVER);
const temperature_pub_topic = process.env.UNIQ_TOPIC + "/temperature/ic";
const temperature_meta_topic = process.env.UNIQ_TOPIC + "/temperature/m";
const light_sub_topic = process.env.UNIQ_TOPIC + "/light/ic";
const light_pub_topic = process.env.UNIQ_TOPIC + "/light/oc";
const rainbow = ["FF0000", "FF7F00", "FFFF00", "00FF00", "0000FF", "4B0082", "8F00FF"];

client.on('connect', () => {
    console.log("MQTT Server connected");
	client.subscribe(light_sub_topic);
});

board.on("ready", () => {
	led = new five.Led(process.env.LED_PIN);
	heater = new five.Led(11);
	rgb = new five.Led.RGB([6, 5, 3]);
	disco_on = heater_on = heat_rising= false;	
	var index = 0;
	
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
	
	board.loop(1000, function() {
		if(disco_on)
		{
			rgb.color(rainbow[index++]);
			rgb.strobe(250);
			if (index === rainbow.length) {
				index = 0;
			}
		}
		else if(!disco_on){
			rgb.stop();
			rgb.off();
		}
		if(heater_on)
		{
			if(heat_rising)
			{
				heater.fadeOut()
			}
			else{
				heater.fadeIn()
			}
			heat_rising = !heat_rising;
		}
		else if (!heater_on){
			heater.off();
		}
	});
	
});



board.on("exit", function() {	
		led.off();
		rgb.off();
		heater.off();
  });

client.on('message', (topic, message) => {

    // message is Buffer
    console.log(topic, message.toString());
    let state = message.toString();

	switch(state){
		case "light-on": led.on();break;
		case "light-off": led.off();break;
		case "disco-on": disco_on = true; break;
		case "disco-off": disco_on = false; break;
		case "heater-on": heater_on = true; break;
		case "heater-off": heater_on = false; break;
	}
    
    // publish current state to the output content topic
    client.publish(light_pub_topic, state);
});


