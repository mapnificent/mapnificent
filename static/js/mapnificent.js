/* globals $, Quadtree, console, L, dcodeIO */

(function(){
'use strict';

function getProgressBar(percent) {
  return $('<div class="progress">' +
    '<div class="progress-bar progress-bar-mapnificent"  role="progressbar" aria-valuenow="' + percent + '" aria-valuemin="0" aria-valuemax="100" style="width: ' + percent + '%">' +
    '<span class="sr-only">' + percent + '% Complete</span>' +
  '</div></div>');
}
function updateProgressBar(progressBar, percent) {
  progressBar.find('.progress-bar').attr({
    'aria-valuenow': percent,
    style: 'width: ' + percent + '%'
  });
  progressBar.find('.sr-only').text(percent + '% Complete');
}

function MapnificentPosition(mapnificent, latlng, time) {
  this.mapnificent = mapnificent;
  this.latlng = latlng;
  this.stationMap = null;
  this.progress = 0;
  this.time = time === undefined ? 15 * 60 : time;
  this.init();
}

MapnificentPosition.prototype.init = function(){
  var self = this;

  this.marker = new L.Marker(this.latlng, {
    draggable: true,
    opacity: 0.5
  });
  this.popup = new L.Popup({
    minWidth: 200
  });
  this.marker
    .bindPopup(this.popup)
    .addTo(this.mapnificent.map);
  this.marker.on('dragend', function(){
    self.updatePosition(self.marker.getLatLng());
  });
  this.startCalculation();
};

MapnificentPosition.prototype.updatePosition = function(latlng, time){
  var needsRedraw = false, needsRecalc = false;
  if (time !== undefined) {
    if (time !== this.time) {
      needsRedraw = true;
    }
    this.time = time;
  }
  if (this.latlng.lat !== latlng.lat || this.latlng.lng !== latlng.lng) {
    needsRecalc = true;
    needsRedraw = true;
  }
  this.latlng = latlng;
  if (needsRecalc) {
    this.marker.setLatLng(this.latlng);
    this.stationMap = null;
    this.progress = 0;
    this.startCalculation();
    this.marker.openPopup();
  }
  if (needsRedraw) {
    this.mapnificent.redraw();
  }
  if (needsRedraw || needsRecalc) {
    this.mapnificent.triggerHashUpdate();
  }
};

MapnificentPosition.prototype.updateProgress = function(percent){
  var addClass = '';
  if (percent === undefined) {
    var max = this.mapnificent.settings.options.estimatedMaxCalculateCalls || 100000;
    percent = this.progress / max * 100;
    if (percent > 99){
      percent = 99;
      addClass = 'progress-striped active';
    }
  }
  this.marker.setOpacity(Math.max(0.5, percent / 100));
  $(this.popup.getContent()).find('.progress').addClass(addClass);
  updateProgressBar($(this.popup.getContent()), percent);
  this.popup.update();
};


MapnificentPosition.prototype.renderProgress = function() {
  var div = $('<div class="position-control">'), self = this;
  var percent = 0;
  var progressBar = getProgressBar(percent);
  div.append(progressBar);
  var removeSpan = $('<span class="position-remove glyphicon glyphicon-trash pull-right">').on('click', function(){
    self.mapnificent.removePosition(self);
  });

  div.append(removeSpan);
  this.popup.setContent(div[0]);
};

MapnificentPosition.prototype.setTime = function(time) {
  if (time !== this.time) {
    this.time = time;
    this.mapnificent.redraw();
    this.mapnificent.triggerHashUpdate();
  }
};

MapnificentPosition.prototype.updateControls = function(){
  var self = this;

  var div = $('<div class="position-control">');

  var minutesTime = Math.round(this.time / 60);

  var input = $('<input type="range">').attr({
    max: Math.round(this.mapnificent.settings.options.maxWalkTravelTime / 60),
    min: 0,
    value: minutesTime
  }).on('change', function(){
    self.setTime(parseInt($(this).val()) * 60);
  }).on('mousemove keyup', function(){
    $(self.popup.getContent()).find('.time-display').text($(this).val() + ' min');
    if (self.mapnificent.settings.redrawOnTimeDrag) {
      self.setTime(parseInt($(this).val()) * 60);
    }
  });

  div.append(input);

  var timeSpan = $('<div class="pull-left">' +
    '<span class="glyphicon glyphicon-time"></span> ' +
     '<span class="time-display">' + minutesTime + ' min</span></div>');
  div.append(timeSpan);

  var removeSpan = $('<span class="position-remove glyphicon glyphicon-trash pull-right">').on('click', function(){
    self.mapnificent.removePosition(self);
  });

  div.append(removeSpan);

  this.popup.setContent(div[0]);
};

MapnificentPosition.prototype.createWorker = function(){
  if (this.webworker) {
    return this.webworker;
  }
  this.webworker = new window.Worker(this.mapnificent.settings.baseurl + 'static/js/mapnificentworker.js');
  this.webworker.onmessage = this.workerMessage();
  this.webworker.onerror = this.workerError;
};

MapnificentPosition.prototype.workerMessage = function() {
  var self = this;
  return function(event){
    if (event.data.status === 'working') {
      self.progress = event.data.at;
      self.updateProgress();
    }
    else if (event.data.status === 'done') {
      console.log('Count loops', event.data.count);
      self.updateProgress(100);
      self.updateControls();
      self.stationMap = event.data.stationMap;
      self.debugMap = event.data.debugMap;
      self.mapnificent.redraw();
    }
  };
};

MapnificentPosition.prototype.workerError = function(){
  return function(event){
    console.log('error', event);
  };
};

MapnificentPosition.prototype.startCalculation = function(){
  this.renderProgress();
  this.marker.openPopup();
  this.createWorker();
  this.webworker.postMessage({
      lat: this.latlng.lat,
      lng: this.latlng.lng,
      // fromStations: nextStations.map(function(m){ return m[0].id; }),
      stations: this.mapnificent.stationList,
      lines: this.mapnificent.lines,
      // distances: nextStations.map(function(m){ return m[1] / 1000; }),
      reportInterval: 5000,
      intervalKey: this.mapnificent.settings.intervalKey,
      maxWalkTime: this.mapnificent.settings.maxWalkTime,
      secondsPerM: this.mapnificent.settings.secondsPerKm / 1000,
      searchRadius: this.mapnificent.settings.initialStationSearchRadius,
      bounds: this.mapnificent.settings.bounds,
      debug: this.mapnificent.settings.debug,
  });
};

MapnificentPosition.prototype.getReachableStations = function(stationsAround, start, tileSize) {
  var self = this;

  var getLngRadius = function(lat, mradius){
    var equatorLength = 40075017,
      hLength = equatorLength * Math.cos(L.LatLng.DEG_TO_RAD * lat);

    return (mradius / hLength) * 360;
  };

  var maxWalkTime = this.mapnificent.settings.maxWalkTime;
  var secondsPerKm = this.mapnificent.settings.secondsPerKm;


  var convert = function(station, reachableIn) {
    var secs = Math.min((self.time - reachableIn), maxWalkTime);
    var mradius = secs * (1 / secondsPerKm) * 1000;
    var point = new L.LatLng(station.lat, station.lng);

    var lngRadius = getLngRadius(station.lat, mradius);
    var latlng2 = new L.LatLng(station.lat, station.lng - lngRadius, true);
    var point2 = self.mapnificent.map.latLngToLayerPoint(latlng2);

    var lpoint = self.mapnificent.map.latLngToLayerPoint(point);
    var radius = Math.max(Math.round(lpoint.x - point2.x), 1);

    var p = self.mapnificent.map.project(point);
    var x = Math.round(p.x - start.x);
    var y = Math.round(p.y - start.y);
    if (x + radius < 0 || x - radius > tileSize ||
        y + radius < 0 || y - radius > tileSize) {
      return null;
    }
    return {x: x, y: y, r: radius};
  };

  var stations = [];

  if (this.stationMap === null) {
    return stations;
  }

  // You start walking from your position
  var station = convert(this.latlng, 0);
  if (station !== null) {
    stations.push(station);
  }

  for (var i = 0; i < stationsAround.length; i += 1) {
    var stationTime = this.stationMap[stationsAround[i].id];
    if (stationTime === undefined || stationTime >= this.time) {
      continue;
    }

    station = convert(stationsAround[i], stationTime);
    if (station !== null) {
      stations.push(station);
    }
  }
  return stations;
};

MapnificentPosition.prototype.destroy = function(){
  this.mapnificent.map.closePopup(this.popup);
  this.mapnificent.map.removeLayer(this.popup);
  this.mapnificent.map.removeLayer(this.marker);
  this.webworker.terminate();
  this.webworker = null;
  this.stationMap = null;
  this.marker = null;
  this.popup = null;
  this.redrawTime = 0;
};

function Mapnificent(map, city, pageConfig){
  this.map = map;
  this.positions = [];
  this.time = 60 * 10;
  // FIXME: this is messy
  this.city = city;
  this.settings = $.extend({
    intervalKey: '1-6',
    baseurl: '/',
    dataPath: city.dataPath || './',
    maxWalkTime: 15 * 60,
    secondsPerKm: 13 * 60,
    initialStationSearchRadius: 1000,
    redrawOnTimeDrag: false,
    debug: window.location.search.indexOf("debug") !== -1,
  }, city);
  this.settings.options = $.extend({
    maxWalkTravelTime: 1.5 * 60 * 60,
  }, this.settings.options)
  this.settings = $.extend(this.settings, pageConfig);
}

Mapnificent.prototype.init = function(){
  var self = this, t0;
  self.tilesLoading = false;
  return this.loadData().done(function(data){
    self.prepareData(data);
    self.canvasTileLayer = L.tileLayer.canvas();
    self.canvasTileLayer.on('loading', function(){
      self.tilesLoading = true;
      t0 = new Date().getTime();
    });
    self.canvasTileLayer.on('load', function(){
      self.tilesLoading = false;
      if (self.needsRedraw) {
        self.redraw();
      }
      self.redrawTime = (new Date().getTime()) - t0;
      console.log('reloading tile layer took', self.redrawTime, 'ms');
    });

    self.canvasTileLayer.drawTile = self.drawTile();
    self.map.addLayer(self.canvasTileLayer);
    self.map.on('click', function(e) {
        self.addPosition(e.latlng);
    });
    self.map.on('contextmenu', function(e) {
      if (self.settings.debug) {
        self.logDebugMessage(e.latlng);
      }
    });
    self.augmentLeafletHash();
    if (self.settings.coordinates) {
      self.hash.update();
      if (self.positions.length === 0) {
        self.addPosition(L.latLng(
          self.settings.coordinates[1],
          self.settings.coordinates[0]
        ));
      }
    }
  });
};

Mapnificent.prototype.logDebugMessage = function(latlng) {
  var self = this;
  var stationsAround = this.quadtree.searchInRadius(latlng.lat, latlng.lng, 300);
  this.positions.forEach(function(pos, i){
    console.log('Position ', i);
    if (pos.debugMap === undefined) {
      console.log('No debug map present');
    }
    stationsAround.forEach(function(station, j){
      var lastTransport;
      console.log('Found station', station.Name);
      if (pos.debugMap[station.id] === undefined) {
        console.log('Not reached');
        return;
      }
      var totalTime = 0
      pos.debugMap[station.id].forEach(function(stop, k){
        var fromName = '$walking'
        var distance
        var toStop = self.stationList[stop.to]
        if (stop.from !== -1) {
          var fromStop = self.stationList[stop.from]
          fromName = fromStop.Name
          distance = self.quadtree.distanceBetweenCoordinates(
            fromStop.Latitude, fromStop.Longitude,
            toStop.Latitude, toStop.Longitude
          )
        }
        if (lastTransport != stop.line) {
          console.log(k, 'Switching transport to', self.lineNames[stop.line],
                      'waiting: ', stop.waittime);
        }
        lastTransport = stop.line;
        var currentTime = stop.time - totalTime;
        totalTime = stop.time;
        console.log(k, fromName, '->',
                    toStop.Name,
                    'via', self.lineNames[stop.line],
                    'in', currentTime,
                    ' (' +
                    'stay: ' + stop.stay +
                    ', total time: ' + stop.time +
                    ', total walk time: ' + stop.walkTime +
                    ', distance: ' + distance +' meters)');
      });
    });
  });
};

Mapnificent.prototype.loadData = function(){
  var dataUrl = this.settings.dataPath + this.settings.cityid;
  if (this.settings.debug) {
    dataUrl += '__debug';
  }
  dataUrl += '.bin';

  const MAPNIFICENT_PROTO = {"nested":{"mapnificent":{"nested":{"MapnificentNetwork":{"fields":{"Cityid":{"type":"string","id":1},"Stops":{"rule":"repeated","type":"Stop","id":2},"Lines":{"rule":"repeated","type":"Line","id":3}},"nested":{"Stop":{"fields":{"Latitude":{"type":"double","id":1},"Longitude":{"type":"double","id":2},"TravelOptions":{"rule":"repeated","type":"TravelOption","id":3},"Name":{"type":"string","id":4}},"nested":{"TravelOption":{"fields":{"Stop":{"type":"uint32","id":1},"TravelTime":{"type":"uint32","id":2},"StayTime":{"type":"uint32","id":3},"Line":{"type":"string","id":4},"WalkDistance":{"type":"uint32","id":5}}}}},"Line":{"fields":{"LineId":{"type":"string","id":1},"LineTimes":{"rule":"repeated","type":"LineTime","id":2},"Name":{"type":"string","id":3}},"nested":{"LineTime":{"fields":{"Interval":{"type":"uint32","id":1},"Start":{"type":"uint32","id":2},"Stop":{"type":"uint32","id":3},"Weekday":{"type":"uint32","id":4}}}}}}}}}}};

  var protoRoot = protobuf.Root.fromJSON(MAPNIFICENT_PROTO);

  var d = $.Deferred();

  var loadProgress = $('#load-progress');
  var progressBar = getProgressBar(0.0);
  loadProgress.find('.modal-body').html(progressBar);
  loadProgress.modal('show');

  var oReq = new XMLHttpRequest();
  oReq.open("GET", dataUrl, true);
  oReq.responseType = "arraybuffer";

  oReq.onload = function(oEvent) {
    var MapnificentNetwork = protoRoot.lookupType('mapnificent.MapnificentNetwork');
    console.log('received binary', new Date().getTime());
    var message = MapnificentNetwork.decode(new Uint8Array(oEvent.target.response));
    console.log('decoded message', new Date().getTime());
    loadProgress.modal('hide');
    d.resolve(message);
  };
  oReq.addEventListener("progress", function updateProgress (oEvent) {
    if (oEvent.lengthComputable) {
      var percentComplete = oEvent.loaded / oEvent.total * 100;
      updateProgressBar(loadProgress, percentComplete);
    } else {
      updateProgressBar(loadProgress, 100);
      loadProgress.find('.progress').addClass('active progress-striped');
    }
  });

  oReq.send();
  return d;
};

Mapnificent.prototype.getLineTimesByInterval = function(lineTimes) {
  var result = {};
  for (var i = 0; i < lineTimes.length; i += 1) {
    result[lineTimes[i].Weekday + '-' + lineTimes[i].Start] = lineTimes[i].Interval;
  }
  return result;
}

Mapnificent.prototype.prepareData = function(data) {
  this.stationList = data.Stops;
  this.lines = {};
  this.lineNames = {};
  var selat = Infinity, nwlat = -Infinity, nwlng = Infinity, selng = -Infinity;

  for (var i = 0; i < this.stationList.length; i += 1){
    this.stationList[i].id = i;
    this.stationList[i].lat = data.Stops[i].Latitude;
    this.stationList[i].lng = data.Stops[i].Longitude;
    selat = Math.min(selat, this.stationList[i].lat);
    nwlat = Math.max(nwlat, this.stationList[i].lat);
    selng = Math.max(selng, this.stationList[i].lng);
    nwlng = Math.min(nwlng, this.stationList[i].lng);
  }

  for (i = 0; i < data.Lines.length; i += 1) {
    if (!data.Lines[i].LineTimes[0]) { continue; }
    this.lines[data.Lines[i].LineId] = this.getLineTimesByInterval(data.Lines[i].LineTimes);
    if (this.settings.debug) {
      this.lineNames[data.Lines[i].LineId] = data.Lines[i].Name;
    }
  }
  var b = 0.01;
  this.settings.bounds = [selat - b, nwlat + b, nwlng - b, selng + b];
  this.quadtree = Quadtree.create(
    this.settings.bounds[0], this.settings.bounds[1],
    this.settings.bounds[2], this.settings.bounds[3]
  );
  this.quadtree.insertAll(this.stationList);
};

Mapnificent.prototype.redraw = function(){
  var self = this;
  this.needsRedraw = true;
  if (this.canvasTileLayer) {
    if (this.tilesLoading) {
      return;
    }
    L.Util.requestAnimFrame(function(){
      self.needsRedraw = false;
      self.canvasTileLayer.redraw();
    });
  }
};

Mapnificent.prototype.addPosition = function(latlng, time){
  this.positions.push(new MapnificentPosition(this, latlng, time));
  this.triggerHashUpdate();
};

Mapnificent.prototype.removePosition = function(pos) {
  this.positions = this.positions.filter(function(p){
    return p !== pos;
  });
  pos.destroy();
  this.redraw();
  this.triggerHashUpdate();
};

Mapnificent.prototype.triggerHashUpdate = function() {
  this.hash.onMapMove();
}

Mapnificent.prototype.drawTile = function() {
  var self = this;

  var maxWalkTime = this.settings.maxWalkTime;
  var secondsPerKm = this.settings.secondsPerKm;

  return function(canvas, tilePoint) {
    if (!self.stationList || !self.positions.length) {
      return;
    }
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* Figure out how many stations we have to look at around
       this tile.
    */

    var tileSize = this.options.tileSize;
    var start = tilePoint.multiplyBy(tileSize);
    var end = start.add([tileSize, 0]);
    var startLatLng = this._map.unproject(start);
    var endLatLng = this._map.unproject(end);
    var spanInMeters = startLatLng.distanceTo(endLatLng);
    var maxWalkDistance = maxWalkTime * (1 / secondsPerKm) * 1000;
    var middle = start.add([tileSize / 2, tileSize / 2]);
    var latlng = this._map.unproject(middle);

    var searchRadius = Math.sqrt(spanInMeters * spanInMeters + spanInMeters * spanInMeters);
    searchRadius += maxWalkDistance;

    var stationsAround = self.quadtree.searchInRadius(latlng.lat, latlng.lng, searchRadius);

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(50,50,50,0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';

    for (var i = 0; i < self.positions.length; i += 1) {
      var drawStations = self.positions[i].getReachableStations(stationsAround, start, tileSize);
      for (var j = 0; j < drawStations.length; j += 1) {
        ctx.beginPath();
        ctx.arc(drawStations[j].x, drawStations[j].y,
                drawStations[j].r, 0, 2 * Math.PI, false);
        ctx.fill();
      }
    }
  };
};

Mapnificent.prototype.augmentLeafletHash = function() {
  var mapnificent = this;
  var formatHash = function(map) {
    var center = map.getCenter(),
        zoom = map.getZoom(),
        precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));

    var params = [
      zoom,
      center.lat.toFixed(precision),
      center.lng.toFixed(precision)
    ];

    mapnificent.positions.forEach(function(pos) {
      params.push(pos.time);
      params.push(pos.latlng.lat.toFixed(precision));
      params.push(pos.latlng.lng.toFixed(precision));
    });

    return "#" + params.join("/");
  }
  var parseHash = function(hash) {
    if(hash.indexOf('#') === 0) {
      hash = hash.substr(1);
    }
    var args = hash.split("/");
    var parsed;
    if (args.length < 3) {
      return false;
    }
    var zoom = parseInt(args[0], 10),
    lat = parseFloat(args[1]),
    lon = parseFloat(args[2]);
    if (isNaN(zoom) || isNaN(lat) || isNaN(lon)) {
      parsed = false;
    } else {
      parsed = {
        center: new L.LatLng(lat, lon),
        zoom: zoom
      };
    }
    var posIndex = 0;
    for (var i = 3; i < args.length; i += 3) {
      var time = parseInt(args[i], 10);
      lat = parseFloat(args[i + 1]);
      lon = parseFloat(args[i + 2]);
      if (isNaN(time) || isNaN(lat) || isNaN(lon)) {
        continue
      }
      if (mapnificent.positions[posIndex] === undefined) {
        mapnificent.addPosition(new L.LatLng(lat, lon), time);
      } else {
        mapnificent.positions[posIndex].updatePosition(new L.LatLng(lat, lon), time);
      }
      posIndex += 1;
    }
    for (i = posIndex; i < mapnificent.positions.length; i += 1) {
      mapnificent.removePosition(mapnificent.positions[i]);
    }
    return parsed;
  };

  L.Hash.prototype.formatHash = formatHash;
  L.Hash.prototype.parseHash = parseHash;
  this.hash = new L.Hash(this.map);
};

//
// onMapMove: function() {
//   // bail if we're moving the map (updating from a hash),
//   // or if the map is not yet loaded
//
//   if (this.movingMap || !this.map._loaded) {
//     return false;
//   }
//
//   var hash = this.formatHash(this.map);
//   if (this.lastHash != hash) {
//     location.replace(hash);
//     this.lastHash = hash;
//   }
// },

window.Mapnificent = Mapnificent;

}());
