var sys = require('util');
var spawn = require("child_process").spawn;
var python_proc = spawn('python',["/home/pi/TitanRover/mobility/autonomous/python3/IMU_Acc_Mag_Gyro.py"]);


//Inject a current_heading, if not, leave undefined ex: var current_heading; You may also adjust target heading depending on when we have waypoints
var current_heading; //leave untouched, written from the IMU
var target_heading = 65; //change to desired target heading, will be replaced post calculation of GPS data
var previous_heading_delta; //leave untouched

//THEN COMMENT THIS OUT
//DRIVE-CONSTANTS: 
var turning_drive_constant = 0; 
var forward_drive_constant = 50;

//DEGREES OF ERROR
var forward_drive_error = 4; //within 4 degrees drive straight

//THROTTLE LOGIC
var throttle_min = -127; //Minimum throttle value acceptable
var throttle_max = 127; //Maximum throttle value acceptable
var leftThrottle;
var rightThrottle;
var previousrightThrottle;
var previousleftThrottle;
var throttlePercentageChange;

//BOOLEAN LOGIC FOR FUNCTIONS
var turning_left = null;
var turning_right = null;

var driveCounter = 0;//initialize counter for testing purposes
var maxDriveCounter = 500; //max value the counter can achienve

//----GRAB DATA FROM IMU----
python_proc.stdout.on('data', function (data){
    current_heading = parseFloat(data);
});

//-------ROVERCONTROL------
var serialPort = require('serialport');
var port = new serialPort('/dev/ttyACM0', {
    baudRate: 9600,
    parser: serialPort.parsers.readline('\n')
});

var x_Axis_arr = new Uint16Array(3);
x_Axis_arr[0] = 0xB;
x_Axis_arr[2] = 0xbbaa;
var x_Axis_buff = Buffer.from(x_Axis_arr.buffer);

var y_Axis_arr = new Uint16Array(3);
y_Axis_arr[0] = 0xC;
y_Axis_arr[2] = 0xbbaa;
var y_Axis_buff = Buffer.from(y_Axis_arr.buffer);

var time = new Date();
function setRightSide(rightSpeed) {
    if (rightSpeed < -127 || rightSpeed > 127) {
        throw new RangeError('speed must be between -127 and 127');
    }
    console.log('Y: ' + rightSpeed );
    // Since we are using unsigened ints for serial make it between 0 and 254
    rightSpeed = rightSpeed + 127;
    parseInt(rightSpeed);
    y_Axis_arr[1] = rightSpeed;
    //x_Axis_arr[1] = parseInt(speed + 127);

    //console.log(y_Axis_buff);
    console.log(y_Axis_arr);
    console.log(y_Axis_buff);
    port.write(y_Axis_buff);
    //port.write(x_Axis_buff)
}

function setLeftSide(leftSpeed) {
    if (leftSpeed < -127 || leftSpeed > 127) {
        throw new RangeError('speed must be between -127 and 127');
    }
    console.log('x: ' + leftSpeed);
    // Since we are using unsigned ints for serial make it between 0 and 254
    leftSpeed = leftSpeed + 127;
    parseInt(leftSpeed);
    x_Axis_arr[1] = leftSpeed;
    console.log(x_Axis_arr);
    console.log(x_Axis_buff);
    port.write(x_Axis_buff);
}

function driveForward(leftSideThrottle, rightSideThrottle) {
    setRightSide(rightSideThrottle);
    setLeftSide(leftSideThrottle);
}

function stopRover() {
    //receiveMobility(zeroMessage[0]);
    //receiveMobility(zeroMessage[1]);
    driveForward(0, 0);
    // Stopping all joints

}
// Any serial data from the arduino will be sent back home
// and printed to the console
port.on('data', function(data) {
    console.log('ArduinoMessage: ' + data);
    var jsonBuilder = {};
    jsonBuilder.ArduinoMessage = data;
    jsonBuilder.type = 'debug';
    //ssendHome(jsonBuilder);
});

port.on('open',function(){
    console.log('open');
    //setTimeout(main,1000);
});

//LOGIC TO KILL ALL PROCESS AND STOP ROVER MID SCRIPT
process.on('SIGTERM', function() {
    console.log("STOPPING ROVER");
    clearInterval(turn_timer);
    clearInterval(drive_timer);
    stopRover();  
    setTimeout(function(){ //required to fully stop the rover
        port.close();
        process.exit();
    },1000);
});

process.on('SIGINT', function() {
    console.log("\n####### JUSTIN LIKES MENS!! #######\n");
    console.log("\t\t╭∩╮（︶︿︶）╭∩╮");
    clearInterval(turn_timer);
    clearInterval(drive_timer);
    stopRover();
    setTimeout(function(){ //required to fully stop the rover
        port.close();
        process.exit();
    },1000);
});
//----END SCRIPT KILL----
//----END ROVER CONTROL----

//Drives the rover forward and making any adjustments along the way.
var forwardPMovement = function() {
    console.log('----ForwardPmovement----')

    drive_timer = setInterval(function() {
        //FOR TESTING OFF ROVER
        driveCounter++;
        //current_heading--;
        //---------------------
        calc_heading_delta();
        console.log("Current Heading: " + current_heading);
        console.log("Target Heading: " + target_heading);
        console.log("Heading Delta: " + heading_delta)
        console.log("Turning left:" + turning_left);
        console.log("Turning right:" + turning_right);
        if (Math.abs(heading_delta) <= forward_drive_error) {
            leftThrottle = forward_drive_constant;
            rightThrottle = forward_drive_constant;
            console.log('Moving forward at drive constant');
        } else {
            //Calculate the throttle percentage change based on what the proportion is.
            throttlePercentageChange = heading_delta/180
            console.log('turning_left: ' + turning_left);
            console.log('turning_right:' + turning_right);
            if(turning_right){
                    console.log('Slowing turning right');
                    leftThrottle = forward_drive_constant + Math.round(forward_drive_constant * throttlePercentageChange);
                    rightThrottle = forward_drive_constant - Math.round(forward_drive_constant * throttlePercentageChange);
            }else if(turning_left){
                    console.log('Slowing turning left');
                    leftThrottle = forward_drive_constant - Math.round(forward_drive_constant * throttlePercentageChange);
                    rightThrottle = forward_drive_constant + Math.round(forward_drive_constant * throttlePercentageChange);
            } else {
                console.log('ERROR - Cannot slowly turn left or right');
            }
        }
        //Checks to see if the currentThrottle values are valid for mechanical input as it is possible that the values can be significantly more or
        //less than throttle_min and throttle_max. Then sets the rover speed to the calculated value

        if (leftThrottle <= throttle_max && leftThrottle >= throttle_min &&  rightThrottle <= throttle_max && rightThrottle >= throttle_min){
            //rover.set_speed(Math.trunc(leftThrottle), Math.trunc(rightThrottle));
            driveForward(leftThrottle, rightThrottle);
            //PUT SET SPEED IN HERE.
            previousleftThrottle = leftThrottle;
            previousrightThrottle = rightThrottle;
            console.log("Setting rover speed - Left: " + leftThrottle + ", right:" + rightThrottle);
        } else {
            //In a later implementtion I want to call turn.js, as if we're trying to adjust this far we're way off on our heading. 
            console.log('Throttle Value outside of motor range');
            console.log("Unfixed LeftThrottle:" + leftThrottle);
            console.log("Unfixed RightThrottle: " + rightThrottle);
            //checks the leftThrottle values to make sure they're within mechanical constraints
            if (leftThrottle > throttle_max){
                leftThrottle = throttle_max;
            } else if (leftThrottle < throttle_min) {
                leftThrottle = throttle_min;
            } else if (leftThrottle <= throttle_max && leftThrottle >= throttle_min) {
               console.log("LEFT THROTTLE OKAY"); 
            } else {
                console.log('ERROR - leftThrottle values undefined');
                stopRover();
                clearInterval(drive_timer);
            }

            //checks the rightThrottle values to make sure they're within mechanical constraints
            if (rightThrottle > throttle_max) {
                rightThrottle = throttle_max;
            } else if (rightThrottle < throttle_min) {
                rightThrottle = throttle_min;
            } else if (rightThrottle <= throttle_max && rightThrottle >= throttle_min) {
                console.log("RIGHT THROTTLE OK");
            } else {
                console.log('ERROR - rightThrottle values undefined');
                stopRover();
                //clearInterval(drive_timer);
            }
            //PUT SET SPEED HERE AS WELL
            driveForward(leftThrottle, rightThrottle);
            console.log("Setting rover speed - Left: " + leftThrottle + ", right:" + rightThrottle);
        }

        if (driveCounter > 50) {
            clearInterval(drive_timer);
            stopRover();
            console.log('----REACHED THE END OF LOOP----');
        } else {
            console.log('Thottle Adjusted');
        }
    },50);
};

//grabbed shan's calc_heading_delta() that we worked on together for the turning/heading logic
function calc_heading_delta(){
    console.log('Calculating Heading Delta & Direction');
    temp_delta = current_heading - target_heading;
    console.log('temp_delta: ' + temp_delta);
// Is turning left or right the shorter turn?
    if(current_heading > target_heading){
        if(Math.abs(temp_delta) > 180){
            // If we were turning left previously or have never turned right before
            if(turning_left || turning_right === null){
                console.log('turning right: '+ current_heading);
                turning_right = true;
                turning_left = false;
            }
            heading_delta = 360 - current_heading + target_heading;
        }else{
              // If we were turning right previously or have never turned left before
             if(turning_right || turning_left === null){
                console.log('turning left: '+ current_heading);
                turning_left = true;
                turning_right = false;
            }
            heading_delta = current_heading - target_heading;
            }
    }else{
        if(Math.abs(temp_delta) > 180){ 
             if(turning_right || turning_left === null){
                console.log('turning left: '+ current_heading);
                turning_left = true;
                turning_right = false;
            }
            heading_delta = 360 - target_heading + current_heading;
        }else{
            if(turning_left || turning_right === null){
                console.log('turning right: '+ current_heading);
                turning_right = true;
                turning_left = false;
            }
            heading_delta = target_heading - current_heading;
        }
    } 
}
setTimeout(main,3000);
function main() 
{
    clearTimeout(main);
    forwardPMovement();
    console.log("----BACK IN MAIN FUNCTION----")
    stopRover();
}