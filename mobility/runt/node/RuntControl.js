/*
  Author: Joseph Porter and Joe Edwards
  Titan Rover - Rover Control
  Description:
		Will be accepting commands from the homebase Controller and relaying
			these commands to its various sub processes

		Example:
			Moblility code will be sent from the homebase controller to here and this will run the input
				or pass it to another process to run it.

		It will be sent as JSON with the format
		{ commandType: string, ...}
		each packet will consist of a commandType such as mobility, science, arm and use this to determine
		the subprocess it should relay it to followed by the data that needs to be sent
*/
var express = require('express');
var fs = require('fs');
var bodyParser = require('body-parser');
//var app = express();
//var server = require('http').Server(app);

var dgram = require('dgram');
var server = dgram.createSocket('udp4');

var PORT = 3000;
var HOST = 'localhost';

const HOME_PORT = 5000;
const HOME_HOST = '192.168.1.143';

// This will be used to zero out the mobility when it has not recieved a message for a certain time.
// zeroMessage[0] for y axis
// zeroMessage[1] for x axis
var zeroMessage = [{
        commandType: "mobility",
        time: Date.now(),
        value: 0,
        number: 0,
        type: 'axis',
        id: 0
    },
    {
        commandType: "mobility",
        time: Date.now(),
        value: 0,
        number: 1,
        type: 'axis',
        id: 0
    }
];

const CONTROL_MESSAGE_ROVER = {
    commandType: "control",
    type: "rover_ack"
};

var gotAck = true;
var gotAckRover = true;
const TIME_TO_STOP = 750;
const TEST_CONNECTION = 3000;

//console.log('Loading mobility:');
// var hrarry = []
// var sum = 0;

// PWM Config for Pi Hat:
const makePwmDriver = require('adafruit-i2c-pwm-driver');
const pwm = makePwmDriver({
    address: 0x40,
    device: '/dev/i2c-1',
    debug: false
});

// Based on J. Stewart's calculations:
// May need to be adjusted/recalculated
// Values for Sabertooth 2X60:
//    1000 = Full Reverse
//    1500 = Stopped
//    2000 = Full Forward.
const saber_min = 241; // Calculated to be 1000 us
const saber_mid = 325; // Calculated to be 1500 us
const saber_max = 409; // Calculated to be 2000 us

const Joystick_MIN = -32767;
const Joystick_MAX = 32767;

// PWM Channel Config:
const left_channel = 0;
const right_channel = 1;

// Based on J. Stewart's calculations:
pwm.setPWMFreq(50);

// NPM Library for USB Logitech Extreme 3D Pro Joystick input:
//    See: https://titanrover.slack.com/files/joseph_porter/F2DS4GBUM/Got_joystick_working_here_is_the_code.js
//    Docs: https://www.npmjs.com/package/joystick
//var joystick = new(require('joystick'))(0, 3500, 350);

// NPM Differential Steering Library:
//    Docs: https://www.npmjs.com/package/diff-steer
var steerMotors = require('diff-steer/motor_control');

// Global Variables to Keep Track of Asynchronous Translated
//    Coordinate Assignment
var lastX = 0;
var lastY = 0;

var throttleValue = 1.0;

/**
 * Prototype function.  Map values from range in_min -> in_max to out_min -> out_max
 * @param {Number} in_min
 * @param {Number} in_max
 * @param {Number} out_min
 * @param {Number} out_max
 * @return {Number} An unnamed value described in range out_min -> out_max
 */
Number.prototype.map = function(in_min, in_max, out_min, out_max) {
    return (this - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
};

function setLeft(speed) {
    pwm.setPWM(left_channel, 0, parseInt(speed));
}

function setRight(speed) {
    pwm.setPWM(right_channel, 0, parseInt(speed));
}

var setMotors = function(diffSteer) {
    setLeft(diffSteer.leftSpeed);
    setRight(diffSteer.rightSpeed);
    //console.log(diffSteer);
};

/**
  Differential steering calculations are done here
  * @param {xAxis}
  * @param {yAxis}
  * @return {speed_of_leftandright}
  */
function calculateDiff(yAxis, xAxis) {
    //xAxis = xAxis.map(Joystick_MIN, Joystick_MAX, 100, -100);
    //yAxis = yAxis.map(Joystick_MIN, Joystick_MAX, 100, -100);

    //xAxis = xAxis * -1;
    //yAxis = yAxis * -1;

    var V = (32767 - Math.abs(xAxis)) * (yAxis / 32767.0) + yAxis;
    var W = (32767 - Math.abs(yAxis)) * (xAxis / 32767.0) + xAxis;
    var right = (V + W) / 2.0;
    var left = (V - W) / 2.0;

    if (right <= 0) {
        right = right.map(-32767, 0, saber_min, saber_mid);
    } else {
        right = right.map(0, 32767, saber_mid, saber_max);
    }

    if (left <= 0) {
        left = left.map(-32767, 0, saber_min, saber_mid);
    } else {
        left = left.map(0, 32767, saber_mid, saber_max);
    }

    return {
        "leftSpeed": left,
        "rightSpeed": right
    };
}

// Set the throttle speed
function setThrottle(adjust_Amount) {
    throttleValue = adjust_Amount.map(32767, -32767, 0, 1);
    //console.log(throttleValue);
}


// Function that handles all mobility from the joystick
var receiveMobility = function(joystickData) {
    // This function assumes that it is receiving correct JSON.  It does not check JSON comming in.
    let axis = parseInt(joystickData.number);
    var value = parseInt(joystickData.value);

    var diffSteer;
   
    value = parseInt(value * throttleValue);
    // X axis
    if (axis === 0) {
        diffSteer = calculateDiff(value, lastY);
        lastX = value;
    }
    // Y axis
    else if (axis === 1) {
        diffSteer = calculateDiff(lastX, value);
        lastY = value;
    }
    // Throttle axis
    else if (axis === 3) {
        setThrottle(value)
    }

    if (axis === 0 || axis === 1) {
	setMotors(diffSteer);
    }
};

// Send 0 to both the x and y axis to stop the rover from running
// Will only be invoked if we lose signal
function stopRover() {
    receiveMobility(zeroMessage[0]);
    receiveMobility(zeroMessage[1]);
}

// Send data to the homebase control for connection information
function sendHome(msg) {
    server.send(msg, 0, msg.length, HOME_PORT, HOME_HOST, function(err) {
        if (err) {
            console.log("Problem with sending data!!!");
        } else {
            //console.log("Sent the data!!!")
        }
    });
}

// Will test the connection to the homebase controller every TEST_CONNECTION times
// Will stop the rover if we have lost connection after TIME_TO_STOP
setInterval(function() {
    var msg = new Buffer(JSON.stringify(CONTROL_MESSAGE_ROVER));
    sendHome(msg);
    gotAckRover = false;
    setTimeout(function() {
        if (gotAckRover === false) {
            console.log("Stopping Rover: TEST CONNECTION from rover")
            stopRover();
        }
    }, TIME_TO_STOP);
}, TEST_CONNECTION);

/**
  Will handle the control messages that will tell us we have disconnected.
  * @param {JSON}
*/
function handleControl(message) {
    var msg;

    //console.log("Control Message with type: " + message.type);

    // If the homestation is testing our connection
    if (message.type == "test") {
        gotAck = false;
        msg = new Buffer(JSON.stringify(CONTROL_MESSAGE_ROVER));
        sendHome(msg);

        // Start a timer to see if we are still connected otherwise stop the rover moving
        setTimeout(function() {
            if (gotAck === false) {
                console.log("Stopping Rover: Test from HOME");
                stopRover();
            }
        }, TIME_TO_STOP);


        // Home station has responded don't need to stop.
    } else if (message.type == "ack") {
        gotAck = true;
        gotAckRover = true;
    }

}


server.on('listening', function() {
    var address = server.address();
    console.log('Rover running on: ' + address.address + ':' + address.port);
});

// recieved a message from the homebase control to perform an action
server.on('message', function(message, remote) {

    var msg = JSON.parse(message);
    //console.log(msg.commandType);

    // Seperate the incoming command to its specified subsystem
    switch (msg.commandType) {
        case 'mobility':
            receiveMobility(msg);
            break;
        case 'control':
            handleControl(msg);
        default:
            //console.log("###### Could not find commandType #######");
    }
});

server.bind(PORT);

process.on('SIGTERM', function() {
    console.log("STOPPING ROVER");
    stopRover();
    process.exit();
});

// On SIGINT shutdown the server
process.on('SIGINT', function() {
    console.log("\n####### Should not have pressed that!! #######\n");
    console.log("###### Deleting all files now!!! ######\n");
    console.log("\t\t╭∩╮（︶︿︶）╭∩╮");
    stopRover();
    // some other closing procedures go here
    process.exit();
});