/* globals $, Quadtree, console, L, dcodeIO */

(function(){
'use strict';

var MAPNIFICENT_PROTO = "package mapnificent;" +
"message MapnificentNetwork {" +
"  required string Cityid = 1;" +
"  message Stop {" +
"    required double Latitude = 1;" +
"    required double Longitude = 2;" +
"    message TravelOption {" +
"      required int32 Stop = 1;" +
"      optional int32 TravelTime = 2;" +
"      optional int32 StayTime = 3;" +
"      optional string Line = 4;" +
"      optional int32 WalkDistance = 5;" +
"  }" +
"    repeated TravelOption TravelOptions = 3;" +
"}" +
"  repeated Stop Stops = 2;" +
"  message Line {" +
"    required string LineId = 1;" +
"    message LineTime {" +
"      required int32 Interval = 1;" +
"      required int32 Start = 2;" +
"      optional int32 Stop = 3;" +
"      optional int32 Weekday = 4;" +
"  }" +
"    repeated LineTime LineTimes = 2;" +
"}" +
"  repeated Line Lines = 3;" +
"}";


function MapnificentPosition(mapnificent, latlng, time) {
  this.mapnificent = mapnificent;
  this.latlng = latlng;
  this.stationMap = null;
  this.progress = 0;
  this.time = time === undefined ? 10 * 60 : 0;
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

MapnificentPosition.prototype.updatePosition = function(latlng){
  this.latlng = latlng;
  this.stationMap = null;
  this.progress = 0;
  this.startCalculation();
  this.marker.openPopup();
  this.mapnificent.redraw();
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
  $(this.popup.getContent()).find('.progress-bar').attr({
    'aria-valuenow': percent,
    style: 'width: ' + percent + '%'
  });
  $(this.popup.getContent()).find('.sr-only').text(percent + '% Complete');
  this.popup.update();
};


MapnificentPosition.prototype.renderProgress = function() {
  var div = $('<div class="position-control">'), self = this;
  var percent = 0;
  var progressBar = $('<div class="progress">' +
    '<div class="progress-bar progress-bar-mapnificent"  role="progressbar" aria-valuenow="' + percent + '" aria-valuemin="0" aria-valuemax="100" style="width: ' + percent + '%">' +
    '<span class="sr-only">' + percent + '% Complete</span>' +
  '</div></div>');
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
  }
};

MapnificentPosition.prototype.updateControls = function(){
  var self = this;

  var div = $('<div class="position-control">');

  var minutesTime = Math.round(this.time / 60);

  var input = $('<input type="range">').attr({
    max: Math.round(this.mapnificent.settings.maxWalkTravelTime / 60),
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
      self.updateProgress(100);
      self.updateControls();
      self.stationMap = event.data.stationMap;
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
      selat: this.mapnificent.settings.southeast.lat,
      nwlat: this.mapnificent.settings.northwest.lat,
      nwlng: this.mapnificent.settings.northwest.lng,
      selng: this.mapnificent.settings.southeast.lng,
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

function Mapnificent(map, city, options){
  this.map = map;
  this.positions = [];
  this.time = 60 * 10;
  // FIXME: this is messy
  this.city = city;
  this.settings = $.extend({
    intervalKey: '1-6',
    baseurl: '/',
    dataPath: city.dataPath || '/data/' + city.cityid + '/',
    maxWalkTime: 15 * 60,
    secondsPerKm: 13 * 60,
    maxWalkTravelTime: 60 * 60,
    initialStationSearchRadius: 1000,
    redrawOnTimeDrag: false
  }, city);
  this.settings = $.extend(this.settings, options);
}

Mapnificent.prototype.init = function(){
  var self = this, t0;
  self.tilesLoading = false;
  return this.loadData().done(function(data){
    self.prepareData(data);
    self.canvasTileLayer = L.tileLayer.canvas();
    self.canvasTileLayer.on('loading', function(){
      console.log('loading');
      self.tilesLoading = true;
      t0 = new Date().getTime();
    });
    self.canvasTileLayer.on('load', function(){
      self.tilesLoading = false;
      if (self.needsRedraw) {
        self.redraw();
      }
      self.redrawTime = (new Date().getTime()) - t0;
      console.log('load', self.redrawTime);
    });
    self.canvasTileLayer.drawTile = self.drawTile();
    self.map.addLayer(self.canvasTileLayer);
    self.map.on('click', function(e) {
        self.addPosition(e.latlng);
    });
    if (self.settings.lat) {
      self.addPosition(L.latLng(self.settings.lat, self.settings.lng));
    }
  });
};

Mapnificent.prototype.loadData = function(){
  // var dataUrl = this.settings.dataPath + this.settings.cityid + '-' + this.settings.version + '-1.json';
  var dataUrl = this.settings.dataPath + this.settings.cityid + '.bin';
  var protoBuilder = dcodeIO.ProtoBuf.loadProto(MAPNIFICENT_PROTO, "mapnificent.proto");

  var d = $.Deferred();

  var oReq = new XMLHttpRequest();
  oReq.open("GET", dataUrl, true);
  oReq.responseType = "arraybuffer";

  oReq.onload = function(oEvent) {
    var MapnificentNetwork = protoBuilder.build('mapnificent.MapnificentNetwork');
    console.log('received binary', new Date().getTime());
    var message = MapnificentNetwork.decode(oEvent.target.response);
    console.log('decoded message', new Date().getTime());
    d.resolve(message);
  };

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

  for (var i = 0; i < this.stationList.length; i += 1){
    this.stationList[i].id = i;
    this.stationList[i].lat = data.Stops[i].Latitude;
    this.stationList[i].lng = data.Stops[i].Longitude;
  }

  for (i = 0; i < data.Lines.length; i += 1) {
    if (!data.Lines[i].LineTimes[0]) { continue; }
    this.lines[data.Lines[i].LineId] = this.getLineTimesByInterval(data.Lines[i].LineTimes);
  }
  this.quadtree = Quadtree.create(
    this.settings.southeast.lat, this.settings.northwest.lat,
    this.settings.northwest.lng, this.settings.southeast.lng
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

Mapnificent.prototype.addPosition = function(latlng){
  this.positions.push(new MapnificentPosition(this, latlng));
};

Mapnificent.prototype.removePosition = function(pos) {
  this.positions = this.positions.filter(function(p){
    return p !== pos;
  });
  pos.destroy();
  this.redraw();
};

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

window.Mapnificent = Mapnificent;

}());
