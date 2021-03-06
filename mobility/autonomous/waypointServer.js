var app = require('express');
var socket = require('http').Server(app);
var io = require('socket.io')(socket);
var net = require('net');
var fs = require('fs');
var jsonfile = require('jsonfile');
var reachIP = '192.168.2.15';
var file = '/home/pi/TitanRover/mobility/autonomous/gps.json';

var gps_packet; // will be overwritten as new data is coming in from reach server
var rover_location;
var temp_waypoint_list = [];
var average_waypoints = [];
var averagePoint = 0;
var currentHeading;

// UNIX SOCKET 
var imu_client = new net.Socket();

imu_client.connect('/home/pi/TitanRover/GPS/IMU/Python_Version/imu_sock', function(){
    console.log("Connected to IMU via UNIX socket ");
});

imu_client.on('data',function(data,err){
    if(err){
        console.log('Error: ', err);
    }
    data = parseFloat(data);
    if ( 0 <= data && data <= 360){
        currentHeading = data;
    } else {
        console.log("ERROR: IMU Heading Out of Range: " + data);
    }
});

// Start the server
socket.listen(9999, function() {
    console.log("============ Waypoints Server is up and running on port: ", socket.address().port, "=============");
});

// Connect to the reach server * you can set the reachs server information in the WebUI
var raspi_client = new net.Socket();
raspi_client.connect(9001, reachIP, function() {
    console.log('Connected to reach');
});

// When we get a data packet from the reach
raspi_client.on('data', function(data,err) {
//	console.log(String(data));
    if(err){
        console.log("Error!: " + JSON.stringify(err));
    }
    /* Example data object from the reach stream
     GPST latitude(deg) longitude(deg)  height(m)   Q  ns   sdn(m)   sde(m)   sdu(m)  sdne(m)  sdeu(m)  sdun(m) age(s)  ratio
     1934 433341.500   33.882028059 -117.882559268    38.7224   5   4   3.9905   3.7742   9.1639   2.7016   4.4366   4.2998   0.00    0.0
     */

    // Parse the data into an array
    data = data.toString().split(" ").filter(the_spaces);

    gps_packet = {
        latitude: data[2],
        longitude: data[3],
    };
    rover_location = gps_packet;
    if(averagePoint == 50){
	averagePoint = 0;
    }
    average_waypoints[averagePoint] = gps_packet;
    averagePoint = averagePoint + 1;
});

function the_spaces(value){
    return value !== '';
}

// Socket.io is going to be handling all the emits events that the UI needs.
io.on('connection', function(socketClient) {
    console.log("Client Connected: " + socketClient.id);

	// emit rover's location every 1.5 seconds
        setInterval(function() {
            //socketClient.emit('rover location', rover_location);
            // if the above doesnt work comment it out & try below
            io.emit('rover location', rover_location);
            io.emit('heading', currentHeading);
        }, 1500);
   

    // request from UI
    socketClient.on('save waypoint', function(callback) {
	setTimeout(function(){
	    var averaged_gps_packet = {
        	latitude: 0,
        	longitude: 0
            };	    
	    for(var i = 0; i < 50; i++){
	    	averaged_gps_packet.latitude = parseFloat(average_waypoints[i].latitude) + parseFloat(averaged_gps_packet.latitude);
		    averaged_gps_packet.longitude = parseFloat(average_waypoints[i].longitude) + parseFloat(averaged_gps_packet.longitude);
	    }
	    averaged_gps_packet.latitude = averaged_gps_packet.latitude/50;
	    averaged_gps_packet.longitude = averaged_gps_packet.longitude/50;
	    console.log('avearaged waypoint: ',averaged_gps_packet);	
	    // pass off to callback supplied from UI

            var averaged_gps_packet = {
                latitude: 0,
                longitude: 0
            };

            for(var i = 0; i < 50; i++){
                averaged_gps_packet.latitude = parseFloat(average_waypoints[i].latitude) + parseFloat(averaged_gps_packet.latitude);
                averaged_gps_packet.longitude = parseFloat(average_waypoints[i].longitude) + parseFloat(averaged_gps_packet.longitude);
            }

            averaged_gps_packet.latitude = averaged_gps_packet.latitude/50;
            averaged_gps_packet.longitude = averaged_gps_packet.longitude/50;
            console.log('averaged waypoint: ',averaged_gps_packet);
            // pass off to callback supplied from UI
            callback(averaged_gps_packet);

            // save into our temp list
            const waypoint = {
               latitude: averaged_gps_packet.latitude,
               longitude: averaged_gps_packet.longitude
            };

            temp_waypoint_list.push(waypoint);
        }, 10000);
    });

    socketClient.on('delete recent waypoint', function () {
        temp_waypoint_list.pop();
    });

    socketClient.on('delete all waypoints', function () {
        temp_waypoint_list = [];
    });

    socketClient.on('save to file', function (callback) {
        jsonfile.writeFile(file, temp_waypoint_list, function(err) {
            if(err) {
                callback(err);
            }
            else {
                // const success = true;
                // callback(err, success);
                console.log("File saved correctly");
            }
        });
    });

    socketClient.on('mission finished', function() {
        console.log('mission finished called from scratch.js');
        io.emit('successful autonomy');
    });
});

process.on('SIGINT', function() {
    console.log("\n####### Waypoints Server shutting down #######\n");
    process.exit();
});
