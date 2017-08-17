var five = require("johnny-five");
var board = new five.Board();

board.on("ready", function() {
  var rgb = new five.Led.RGB([6, 5, 3]);
  var index = 0;
  var rainbow = ["FF0000", "FF7F00", "FFFF00", "00FF00", "0000FF", "4B0082", "8F00FF"];

  this.loop(1000, function() {
    rgb.color(rainbow[index++]);
	rgb.strobe(250);
    if (index === rainbow.length) {
      index = 0;
    }
  });
  
  this.on("exit", function() {
    rgb.off();
  });
});