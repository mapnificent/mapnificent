'use strict';
var mapnificentPoster;
var mapnificentWorker = (function(undefined) {

  var stationMap, stations, lines, reportInterval; // "global" variables

  var calculateTimes = function(nextStations, lines, secondsPerKm, maxWalkTime) {
    var nsl = nextStations.length,
      uberNextStations = [], count = 0,
      i, j, arrival, stationId, station, rStation, travelOptionLength,
      stay, seconds, line, nextSeconds, waittime, from, testWalkTime, walkTime;

    while (nsl > 0){ // as long as we have next stations to go
      for (i = 0; i < nsl; i += 1){
        count += 1;
        // Reporting progress to main thread occasionally
        if (reportInterval !== 0 && count % reportInterval === 0){
          mapnificentPoster({status: 'working', at: count});
        }

        arrival = nextStations[i];
        stationId = arrival.stationId;
        line = arrival.line;
        seconds = arrival.seconds;
        stay = arrival.stay;
        walkTime = arrival.walkTime;
        from = arrival.from;
        station = stations[stationId];
        travelOptionLength = station.TravelOptions.length;
        /* I call the following: same line look ahead
           if you are on line 1 and you arrive at station X,
           only to realize that you arrived at X before in shorter time with another line Z!
           No despair, your arrival migth be still of use!
           Since anyone who arrived here before with line Z has to wait for your line 1
           Therefore you still might be faster to arrive at the next stop on line 1,
           because you don't have to wait, you are on line 1 (only wait = stay time)
           Check if you can arrive faster at the next station of your line and if so, travel there.
        */
        if (line !== -1 && stationMap[stationId] !== undefined &&
                           stationMap[stationId] <= seconds){
          for (j = 0; j < travelOptionLength; j += 1){
            rStation = station.TravelOptions[j];
            if(rStation.Stop != from && rStation.Line === line){
              nextSeconds = seconds + rStation.TravelTime + stay;
              if (stationMap[rStation.Stop] === undefined ||
                  stationMap[rStation.Stop] > nextSeconds) {
                uberNextStations.push({
                  stationId: rStation.Stop,
                  line: rStation.Line,
                  stay: rStation.StayTime,
                  seconds: nextSeconds,
                  walkTime: walkTime,
                  from: stationId
                });
              }
            }
          }
          // stationMap[stationId] <= seconds from above still holds, continue;
          continue;
        }
        // If I arrived faster before at this station, continue;
        if(stationMap[stationId] !== undefined && stationMap[stationId] <= seconds){
          continue;
        }
        // If I arrived here the fastest, record the time
        stationMap[stationId] = seconds;
        // check all connections from this station
        for (j = 0; j < travelOptionLength; j += 1) {
          rStation = station.TravelOptions[j];
          if (rStation.Stop === from) {
            // don't go back, can't possibly be faster
            continue;
          }
          if (rStation.WalkTime !== null) { // Walking
            /* calculate time to travel the distance, if it takes longer than
              maximum allowed walking time, continue */
            testWalkTime = rStation.WalkTime * secondsPerKm;
            if (walkTime + testWalkTime > maxWalkTime) {
              continue;
            }
            nextSeconds = seconds + testWalkTime;
            walkTime += testWalkTime;
          } else if (from === -1) {
            // My first station
            if (lines[rStation.Line] === undefined) {
              // line is not in service at current time
              continue;
            }
            // I don't have to wait (design decision)
            nextSeconds = seconds + rStation.TravelTime;
          } else if (rStation.Line === line) {
            // Same line! The current transport may pause here for some time
            nextSeconds = seconds + rStation.TravelTime + stay;
          } else {
            waittime = lines[rStation.Line];
            if (waittime === undefined) {
              // line is not in service at current time
              continue;
            }
            // Switch line! Guess the wait time for the next line
            // Apply clever heuristic. Yeah...
            if (waittime > 0 && waittime < 10) {
              waittime = waittime / 2;
              // waittime = waittime/2;
            } else if (waittime >= 10){
              waittime = waittime / 2.3;
            } else {
              waittime = 0;
            }
            nextSeconds = seconds + waittime + rStation.TravelTime;
            if (nextSeconds < 0){
              nextSeconds = 0; // whut??
            }
          }
          // add to next station list
          uberNextStations.push({
            stationId: rStation.Stop,
            line: !rStation.Line ? -1 : rStation.Line,
            stay: rStation.StayTime,
            seconds: nextSeconds,
            walkTime: walkTime,
            from: stationId
          });
        }
      }
      nextStations = uberNextStations;
      nsl = nextStations.length;
      uberNextStations = [];
    }
    return count;
  };

  return function(event) {
    stationMap = {};
    stations = event.data.stations;
    lines = event.data.lines;
    reportInterval = event.data.reportInterval;
    var fromStations = event.data.fromStations,
      distances = event.data.distances,
      maxWalkTime = event.data.maxWalkTime,
      secondsPerKm = event.data.secondsPerKm,
      intervalKey = event.data.intervalKey,
      optimizedLines = {};

    // throw away any timezones that are not the requested ones
    for(var line in lines){
      if(lines[line][intervalKey] !== undefined){
        optimizedLines[line] = lines[line][intervalKey];
      }
    }

    /* The caller already calculated the next
      couple of stations (fromStations)
      and their distance in kilometers (distances)
      from the starting point
    */

    var startStations = [];
    for (var k = 0; k < fromStations.length; k += 1) {
      var seconds = distances[k] * secondsPerKm;
      if (seconds <= maxWalkTime){
        startStations.push({
          stationId: fromStations[k],
          line: -1,  // walking to station
          stay: 0,
          seconds: seconds,
          walkTime: seconds,
          from: -1
        });
      }
    }
    var count = calculateTimes(startStations, optimizedLines, secondsPerKm, maxWalkTime);

    if (reportInterval !== 0) {
      mapnificentPoster({status: 'working', at: count});
    }
    mapnificentPoster({status: 'done', stationMap: stationMap});
  };
}());

onmessage = mapnificentWorker;
mapnificentPoster = postMessage;
