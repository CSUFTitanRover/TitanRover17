File IMU_Acc_Mag_Gyro.py
==============================================================================================================================

This program will read the IMU registers and provide heading, pitch, roll angles.  Written to function with the Adafruit 10-DOF 
IMU Breakout board which has the following chips:

1. LSM303DLHC - Accelerometer Compass
2. L3DG20H - Gyroscope
3. BMP180 - Barometric/Temperature sensor

This script will provide all axis, temp, and pressure values to the Rover system when 
the process is called upon.  

Communication: I2C

==============================================================================================================================

Version:  1.0 
=============
Date:  12/29/16

- Provides output for all axis information.  Software bug for chip orientation if flipped over.

Version:   1.1
=============
Date:  1/03/16

- Commented out unused output for Rover system.  
- Added test.js which simulates the reading of values from IMU_Acc_Mag_Gyro.py process
	- Software bug exists in transfer of first value between Python Script and Test.js
- Disabled looping functions to save process cycles on Raspberry Pi.

Version:   1.2
=============
Date:   1/05/16

- Combined seperated functions and cleaned up code
- Timing Analysis clocks the test.js start to receive @ 105ms


Bugs:
=============
>test.js still has a issue with first value return.  Chip flip will cause a crash if happens while being read from.


Future Plans:
=============

>Need to add initializations of IMU to start up files in linux.  Each time process starts the chip is reinit. causing possible delay in process timing.