/* 
    (c) Copyright 2010 Stefan Wehrmeyer.
    http://stefanwehrmeyer.com
    
*/

window["Mapnificent"] = (function(window, document, $, undefined){
    
    var getOSMMapType = function(){
        return new google.maps.ImageMapType({
            getTileUrl: function(coord, zoom) {
                return 'http://tile.openstreetmap.org/'+ zoom +'/'+ coord.x +'/' + coord.y +'.png';
            },
            tileSize: new google.maps.Size(256, 256),
            isPng: true,
            maxZoom: 18,
            name: "OSM"
        });
    };
    
    var CanvasOverlay = (function() {
        /* Most of this is from:
        http://code.google.com/apis/maps/documentation/javascript/overlays.html#CustomOverlays
        some of it is from: http://econym.org.uk/gmap/elabel.htm
        */
        function CanvasOverlay(point, canvasID, clb, map) {
            this.point = point;
            this.addclb = clb;
            this.canvasID = canvasID;
            // Optional parameters
            this.hidden = false;

            // Now initialize all properties.
            this.map_ = map;

            // We define a property to hold the image's
            // div. We'll actually create this div
            // upon receipt of the add() method so we'll
            // leave it null for now.
            this.div_ = null;

            // Explicitly call setMap() on this overlay
            this.setMap(map);
        }

        CanvasOverlay.prototype = new google.maps.OverlayView();
        CanvasOverlay.prototype.onAdd = function() {

          // Note: an overlay's receipt of onAdd() indicates that
          // the map's panes are now available for attaching
          // the overlay to the map via the DOM.

          // Create the DIV and set some basic attributes.
          var div = document.createElement('DIV');
          div.style.border = "none";
          div.style.borderWidth = "0px";
          div.style.position = "absolute";
          var cnvs = document.createElement("canvas");
          cnvs.id = this.canvasID;
          cnvs.width=20;
          cnvs.height=20;

          div.appendChild(cnvs);

          // Set the overlay's div_ property to this DIV
          this.div_ = div;
          this.hasCalledCallback = false;
          // We add an overlay to a map via one of the map's panes.
          // We'll add this overlay to the overlayImage pane.
          var panes = this.getPanes();
          panes.mapPane.appendChild(div);
        };
        CanvasOverlay.prototype.draw = function() {
            var p = this.getProjection().fromLatLngToDivPixel(this.point);
            var h = parseInt(this.div_.clientHeight, 10);
            this.div_.style.left = (p.x) + "px";
            this.div_.style.top = (p.y - h) + "px";
            if(!this.hasCalledCallback){
              this.hasCalledCallback = true;
              this.addclb();
            }
        };
        
        CanvasOverlay.prototype.fromLatLngToDivPixel = function(point){
            return this.getProjection().fromLatLngToDivPixel(point);
        };
        
        CanvasOverlay.prototype.fromDivPixelToLatLng = function(point){
            return this.getProjection().fromDivPixelToLatLng(point);
        };
        
        CanvasOverlay.prototype.setPoint = function(point) {
          this.point = point;
          this.draw();
        };
        CanvasOverlay.prototype.getPoint = function() {
          return this.point;
        };
        CanvasOverlay.prototype.onRemove = function() {
          this.div_.parentNode.removeChild(this.div_);
          this.div_ = null;
        };
        CanvasOverlay.prototype.hide = function() {
          if (this.div_) {
            this.div_.style.visibility = "hidden";
          }
        };

        CanvasOverlay.prototype.show = function() {
          if (this.div_) {
            this.div_.style.visibility = "visible";
          }
        };

        CanvasOverlay.prototype.toggle = function() {
          if (this.div_) {
            if (this.div_.style.visibility == "hidden") {
              this.show();
            } else {
              this.hide();
            }
          }
        };

        CanvasOverlay.prototype.toggleDOM = function() {
          if (this.getMap()) {
            this.setMap(null);
          } else {
            this.setMap(this.map_);
          }
        };
        return CanvasOverlay;
    }());
    
    var layerCount = 0;
    var layerData = {};
    var minZoomLevel = 5;
    var globalLayers = {};

    
    var func = function(useroptions){
        var that = {};
        var layers = {};
        var mapFullyLoaded = false;
        var idleTimeout = false;
        var isHidden = false;
        var createdMap = false;
        
        var options = useroptions || {};
        var defaults = {
            mapStartZoom: 11
            ,dataUrlPrefix: "http://mapnificent.stefanwehrmeyer.com/data/"
            ,mapStartCenter: {"lat": 52.51037058766109, "lng": 13.333282470703125}
            ,mapStyles : {"Night": [
                  {
                    featureType: "all",
                    elementType: "all",
                    stylers: [
                      { invert_lightness: true }
                    ]
                  }
                  // ,{
                  //                     featureType: "road",
                  //                     elementType: "all",
                  //                     stylers: [
                  //                       { hue: "#0800ff" }
                  //                     ]
                  //                   },{
                  //                     featureType: "poi",
                  //                     elementType: "all",
                  //                     stylers: [
                  //                       { hue: "#1900ff" }
                  //                     ]
                  //                   },{
                  //                     featureType: "water",
                  //                     elementType: "all",
                  //                     stylers: [
                  //                       { hue: "#0008ff" }
                  //                     ]
                  //                   }
                ]}
            ,startMapStyle: null
            ,mapTypes: {"OSM": getOSMMapType()}
            ,startMapType: google.maps.MapTypeId.ROADMAP
            ,mapTypeIds: [google.maps.MapTypeId.ROADMAP]
            ,heightCacheFactor: 4
            ,widthCacheFactor: 4
            ,layerSettings: {}
        };
        that["env"] = {};
        for(var key in defaults){
            if(options[key] !== undefined){
                that.env[key] = options[key];
            } else {
                that.env[key] = defaults[key];
            }
        }
        if(options.layerSettings !== undefined){
            that.env.layerSettings = options.layerSettings;
        }
        that.env.mapGStartCenter = new google.maps.LatLng(that.env.mapStartCenter.lat, that.env.mapStartCenter.lng);
        that.env.circleRadians = (Math.PI/180)*360;
        that.DegToRadFactor = Math.PI / 180;
        that.RadToDegFactor = 180 / Math.PI;
        that.offsetActive = false;
        $(window).resize(function(){that.resize();});
        
        that["createLayer"] = function(){
            return {
                getTitle :          function(){return "";},
                activate :          function(){},
                deactivate :        function(){},
                getDrawingLevel :   function(){return 20;},
                redraw :            function(ctx){},
                setup :             function(container){},
                destroy :           function(){}
            };
        };
        
        var getMapDivHeight = function(){
            return $(window).height() - $("#topnav").height();
        };
    
        that["initMap"] = function(mapID) {
            createdMap = true;
            var style, type;
            that.mapID = mapID;
            that.env.ie = false;
            for(style in that.env.mapStyles){
                that.env.mapTypeIds.push(style);
            }
            for(type in that.env.mapTypes){
                that.env.mapTypeIds.push(type);
            }
            
            var mapOptions = {
              "zoom": that.env.mapStartZoom
              , "center": that.env.mapGStartCenter
              , "mapTypeId": that.env.startMapType
              , "mapTypeControlOptions": {
                  "mapTypeIds": that.env.mapTypeIds
              }
              ,"scaleControl": true
              ,"scaleControlOptions": {
                  "position": google.maps.ControlPosition.BOTTOM_LEFT //RIGHT_TOP
              }
            };
            $("#"+that.mapID).height(getMapDivHeight());
            that["map"] = new google.maps.Map(document.getElementById(that.mapID), mapOptions);
            for(style in that.env.mapStyles){
                var styledMapType = new google.maps.StyledMapType(that.env.mapStyles[style], {name: style});
                that.map.mapTypes.set(style, styledMapType);
            }
            for(type in that.env.mapTypes){
                that.map.mapTypes.set(type, that.env.mapTypes[type]);
            }
            if(that.env.startMapStyle){
                that.map.setMapTypeId(that.env.startMapStyle);
            }
            google.maps.event.addListener(that.map, "maptypeid_changed", function(){
                if(that.map.getMapTypeId() === "OSM"){
                    $("#osm-copyright").show().parent().show();
                } else {
                    $("#osm-copyright").hide();
                }
                if(mapFullyLoaded){
                    that.moveMapPosition();
                    Event.trigger("redraw");
                }
            });
            that["addToMap"](that.map);
        };
        
        that["addToMap"] = function(mapObject) {
            that.map = mapObject;
            that.canvas_id = "mapnificent-canvas";
            while(document.getElementById(that.canvas_id) !== null){
                that.canvas_id += "0"; // Desperate move here
            }
            that.mapSize = {"width": $(that.map.getDiv()).width(), "height": getMapDivHeight()};
            that.heightCacheOffset = (that.mapSize.height*(that.env.heightCacheFactor - 1))/2;
            that.widthCacheOffset = (that.mapSize.width*(that.env.widthCacheFactor - 1))/2;
            
            var onaddcallback = function(){
                mapFullyLoaded = true;
                that.canvas = document.getElementById(that.canvas_id);
                if(typeof G_vmlCanvasManager !== "undefined"){
                    that.env.ie = true;
                    alert("Your browser might or might not work. Rather use a better one.");
                    G_vmlCanvasManager.initElement(that.canvas);
                }
                if(typeof that.canvas.getContext === "undefined"){
                    /* Uh, oh, no canvas ahead!! Crash! */
                    that.showMessage("Please Use a more modern browser", true);
                    return;
                }
                that.setCanvasDimensions();
                that.ctx = that.canvas.getContext("2d");
                that.checkCompositing();
                that.moveMapPosition();
                that.setup();
                Event.trigger("initDone");
            };
            that.canvasoverlay = new CanvasOverlay(that.env.mapGStartCenter, that.canvas_id, onaddcallback, that.map);
            google.maps.event.addListener(that.map, "zoom_changed", function(oldLevel, newLevel){
                that.ctx.clearRect(0,0,that.canvas.width, that.canvas.height);
                window.setTimeout(function(){
                    if(that.map.getZoom() >= minZoomLevel){
                        that.moveMapPosition();
                        Event.trigger("zoom");
                        Event.trigger("redraw");
                    }
                },500);
            });
            google.maps.event.addListener(that.map, "dragend", function(){
                if(that.map.getZoom() >= minZoomLevel){
                    if(that.moveMapPosition()){
                        Event.trigger("redraw");
                    }
                }
            });
        };
        
        that["destroy"] = function(){
            that.canvasoverlay.setMap(null);
            for(var idname in layers){
                layers[idname].layerObject.destroy();
            }
        };
        
        that["hide"] = function(){
            that.canvasoverlay.hide();
            isHidden = true;
        };
        
        that["show"] = function(){
            that.canvasoverlay.show();
            isHidden = false;
            mapnificent.trigger("redraw");
        };
        
        that.moveMapPosition = function(){
            that.mapBounds = that.map.getBounds();
            that.mapBoundsXY = that.canvasoverlay.fromLatLngToDivPixel(that.mapBounds.getSouthWest());
            that.canvasoverlayxy = that.canvasoverlay.fromLatLngToDivPixel(that.canvasoverlay.getPoint());
            var boundnexy = that.canvasoverlay.fromLatLngToDivPixel(that.mapBounds.getNorthEast());
            var need = false;
            if((that.mapBoundsXY.x-that.widthCacheOffset*(1/3)) < that.canvasoverlayxy.x){
                need = true;
            } else if((boundnexy.x+that.widthCacheOffset*(1/3)) > that.canvasoverlayxy.x+that.canvas.width){
                need = true;
            } else if((that.mapBoundsXY.y+that.heightCacheOffset*(1/3)) > that.canvasoverlayxy.y){
                need = true;
            } else if((boundnexy.y - that.heightCacheOffset*(1/3)) < that.canvasoverlayxy.y - that.canvas.height){
                need = true;
            }
            if(need){
                that.setCanvasPosition();
                return true;
            }
            return false;
        };
        
        that.setCanvasPosition = function(){
            var point = that.getCanvasPosition();
            that.canvasoverlay.setPoint(point);
            that.canvasoverlayxy = that.canvasoverlay.fromLatLngToDivPixel(point);
        };
    
        /* Repositions the map around the current view port */
        that.getCanvasPosition = function(){
            var pxnpm = new google.maps.Point(that.mapBoundsXY.x - that.widthCacheOffset, that.mapBoundsXY.y+that.heightCacheOffset);
            return that.canvasoverlay.fromDivPixelToLatLng(pxnpm);
        };
        
        that.setCanvasDimensions = function(){
            that.mapSize = {"width": $(that.map.getDiv()).width(), "height": getMapDivHeight()};
            that.heightCacheOffset = (that.mapSize.height*(that.env.heightCacheFactor - 1))/2;
            that.widthCacheOffset = (that.mapSize.width*(that.env.widthCacheFactor - 1))/2;
            that.canvas.width = that.mapSize.width*that.env.widthCacheFactor;
            that.canvas.height = that.mapSize.height*that.env.heightCacheFactor;
        };
                
        that.resize = function(){
            $("#"+that.mapID).height(getMapDivHeight());
            if(that.map){
                google.maps.event.trigger(that.map, "resize");
                that.setCanvasDimensions();
                that.moveMapPosition();
                Event.trigger("resize");
                Event.trigger("redraw");
            }
        };
        
                
        that.setNightTime = function(){
            that.map.setMapTypeId("Night");
        };
        
        that.setDayTime = function(){
            that.map.setMapTypeId(google.maps.MapTypeId.ROADMAP);
        };
    
        that.checkCompositing = function(){
            if(typeof that.ctx.getImageData === "undefined"){
                that.env.hasCompositing = false;
                return;
            }
            that.env.hasCompositing = true;
            that.ctx.save();
            that.ctx.clearRect(0,0,that.canvas.width, that.canvas.height);
            that.ctx.fillStyle = "rgba(255,255,255,1)";
            that.ctx.fillRect(0,0,3,3);
            that.ctx.globalCompositeOperation = "destination-in";
            that.ctx.fillRect(2,2,3,3);
            that.ctx.globalCompositeOperation = "source-out";
            that.ctx.fillStyle = "rgba(75,75,75,0.75)";
            that.ctx.fillRect(0,0,5,5);
            var pix = that.ctx.getImageData(1, 1, 1, 1).data;
            if(pix[3] === 0){ // Compositing fails, there is full transparency here
                /* This currently affects webkit browsers: safari, chromium, chrome */
    //            that.showMessage("Your browser fails some drawing tests. Your Mapnificent will not look optimal!");
                that.env.hasCompositing = false;
            }
            that.ctx.restore();
            that.ctx.clearRect(0,0,that.canvas.width, that.canvas.height);
        };
    
        
        var Event = (function(){
            var events = {};
            return {
                "trigger": function(ev, paramObj) {
                    if (events[ev] !== undefined){
                        for(var i=0;i<events[ev].length;i++){
                            events[ev][i](paramObj);
                        }
                    }
                }
                ,"bind": function(ev,fn) {
                    if (events[ev] === undefined){
                        events[ev] = [];
                    }
                    events[ev].push(fn);
                }
                ,"unbind": function(ev, fn) {
                    if (events[ev] !== undefined){
                        var nCustomEvents = [];
                        for(var i=0;i<events[ev].length;i++){
                            if(events[ev][i] != fn){
                                nCustomEvents.push(events[ev][i]);
                            }
                        }
                        events[ev] = nCustomEvents;
                    }
                }
            };   
        }());
        
        that["trigger"] = function(name){
            Event.trigger(name);
        };  
        that["bind"] = function(name, fn){
            Event.bind(name, fn);
        };
        that["unbind"] = function(name, fn){
            Event.unbind(name, fn);
        };
        
        that.getControls = function(idname) {
            return $("#controls");
        };
        
        that.getDrawingContext = function(){
            return that.ctx;
        };
        
        that.redraw = function(){
            var idname, i;
            window.clearTimeout(idleTimeout);
            that.ctx.globalCompositeOperation = "source-over";
            that.ctx.globalAlpha = 1;
            that.ctx.clearRect(0,0,that.canvas.width, that.canvas.height);
            if (layerCount > 0){
                var layerArr = [];
                for(idname in layers){
                    layerArr.push(layers[idname]);
                }
                layerArr.sort(function(a,b){return a.layerObject.getDrawingLevel() - b.layerObject.getDrawingLevel();});

                for(i=0;i<layerArr.length;i++){
                    layerArr[i].layerObject.redraw(that.ctx);
                }
            } else {
                for(idname in layers){
                    layers[idname].layerObject.redraw(that.ctx);
                }
            }
            that.canvasoverlay.draw();
            idleTimeout = window.setTimeout(function(){
                that.trigger("idleAfterRedrawing");
            }, 500);
        };
                    
        that["getDistanceInKm"] = function(pos1, pos2) {
            var R = 6371, // in kilometers
                DegToRadFactor = Math.PI / 180;
            return Math.acos(Math.sin(pos1.lat * DegToRadFactor) * Math.sin(pos2.lat * DegToRadFactor) +
                              Math.cos(pos1.lat * DegToRadFactor) * Math.cos(pos2.lat * DegToRadFactor) *
                              Math.cos((pos2.lng - pos1.lng) * DegToRadFactor)) * R;
        };
    
        that.setup = function() {
            that.bind("redraw", that.redraw);
            for(var idname in layers){
                that.setupLayer(idname);
            }
            that.resize();
        };
        
        that["addLayer"] = function(name, ui){
            layers[name] = globalLayers[name] || {};
            layers[name]["ui"] = ui;
        };
    
        that.setupLayer = function(idname, layer) {
            layers[idname].idname = idname;
            layers[idname].layerObject = layers[idname].create(that);
            if(layers[idname].ui){
                layers[idname].ui(that, layers[idname].layerObject, $, window);
            }
            var container = that.getControls(idname);
            var lsettings = {};
            if(that.env.layerSettings[idname] !== undefined){
                lsettings = that.env.layerSettings[idname];
            }
            lsettings["isOpera"] = $.browser.opera;
            layers[idname].layerObject.setup(container, lsettings);
        };
        
        that["getCanvasXY"] = function(pos) {
            var xy = that.canvasoverlay.fromLatLngToDivPixel(new google.maps.LatLng(pos.lat, pos.lng));
            var x = xy.x - (that.canvasoverlayxy.x);
            var y = xy.y - (that.canvasoverlayxy.y-that.canvas.height);
            return {"x" : x, "y": y};
        };
        
        that["getDivXY"] = function(pos) {
            return that.canvasoverlay.fromLatLngToDivPixel(new google.maps.LatLng(pos.lat, pos.lng));
        };
        
        that["getLatLngFromWindowXY"] = function(x,y){
            var latlng = that.canvasoverlay.getProjection().fromContainerPixelToLatLng(
                new google.maps.Point(x, y), true);
            return {"lat": latlng.lat(), "lng": latlng.lng()};
        };

        that["getLatLngFromCanvasXY"] = function(x,y){
            x = x + that.canvasoverlayxy.x;
            y = y + (that.canvasoverlayxy.y-that.canvas.height);
            var latlng = that.canvasoverlay.getProjection().fromDivPixelToLatLng(
                new google.maps.Point(x, y), true);
            return {"lat": latlng.lat(), "lng": latlng.lng()};
        };
        
        that["getLayerData"] = function(idname, index){
            return layerData[idname][index];
        };
        
        that["getLayer"] = function(idname){
            return layers[idname].layerObject;
        };
                
        return that;
    };
    
    func["addLayer"] = function(name, obj){
        globalLayers[name] = globalLayers[name] || {};
        globalLayers[name] = {"create": obj};
        layerCount += 1;
    };
    func["addLayerData"] = function(name, obj){
        if(!layerData[name]){
            layerData[name] = [];
        }
        layerData[name].push(obj);
    };
    
    func["isBrowserSupported"] = function(){
            return !!window.Worker && !!window.postMessage;
    };
        
    func["forCoordinates"] = function(coords, callback){
        $.getJSON("http://www.mapnificent.net/api/checkCoordinates/?callback=?",coords, function(data){
            callback(data);
        });
    };
    
    return func;
}(window, document, $));/* 
    (c) Copyright 2010 Stefan Wehrmeyer.
    http://stefanwehrmeyer.com

*/

Mapnificent.addLayer("urbanDistance", function (mapnificent){
    var debugging = false;
    var Event = (function(){
        var events = {};
        return {
            trigger: function(ev, paramObj) {
                if (events[ev] !== undefined){
                    for(var i=0;i<events[ev].length;i++){
                        events[ev][i](paramObj);
                    }
                }
            }
            ,bind: function(ev,fn) {
                if (events[ev] === undefined){
                    events[ev] = [];
                }
                events[ev].push(fn);
            }
            ,unbind: function(ev, fn) {
                if (events[ev] !== undefined){
                    var nCustomEvents = [];
                    for(var i=0;i<events[ev].length;i++){
                        if(events[ev][i] != fn){
                            nCustomEvents.push(events[ev][i]);
                        }
                    }
                    events[ev] = nCustomEvents;
                }
            }
        };   
    }());
    
    var that = mapnificent.createLayer();
    
    that["idname"] = "urbanDistance";
    
    that["calculationLoopCount"] = 0;
    var options = {
        "secondsPerKmWalking": 13*60
        , 'secondsPerKmBiking': 6*60
        , "colorMaxAcceptableTime": 120
        , "colorBaseGradientColor": 120
        , "colorMaxGradientColor": 240
        , "maxWalkTime": 15*60
        , "maxWalkTravelTime": 180
        , "dayTimeEnabled": true
        , "intervalKey": "m1"
        , "animateAreaGrowth": false
        , "animatedAreaOpacity": false
        , "defaultStartAtPosition": {"lat": mapnificent.map.getCenter().lat(), "lng": mapnificent.map.getCenter().lng()}
        , "darkOverlayColor": "rgba(50,50,50,0.4)"
        , "availableTimes": ["0", "1", "2", "3", "4"]
        , "drawColor": "rgba(0,0,0,1)"
        , "estimatedMaxCalculateCalls": 50000
        , "cityData": "berlin"
        , "calculateOnDrag": false
        , "dataSize": 9509991
        , "dataUrlPrefix": mapnificent.env["dataUrlPrefix"]
        , "intersection": false
        , "color": false
        , "isOpera": false
        , "northwest": {"lat":52.754364, "lng":12.882953}
        , "southeast": {"lat":52.29693, "lng":13.908883}
        , "workerURL": "/static/layers/urbandistanceworker.js"
        , "apiVersion": 1
        , "copyright": ""
    };
    var localDefault = {};
    for(var key in options){
        localDefault[key] = options[key];
    }
    options["secondsPerKm"] = options["secondsPerKmWalking"];
    options["reportInterval"] = Math.round(options["estimatedMaxCalculateCalls"]/20);
    var LOCK = false
        , numberOfCalculations = 0
        , canCalculate = false
        , positionCounter = -1
        , stationList = []
        , blockGrid = undefined
        , stations = {}
        , lines = {}
        , colorCache = {}
        , blockCountX = undefined
        , blockCountY = undefined
        , blockSize = 0.5 // in km 500 * 500 meters per block
        , imageData = null
        , coveredArea = false
        ;
        
    var getRealWorkerFacade = function(){
        return function(path){
            return new window["Worker"](path);
        };
    };
    
    var getFakeWorkerFacade = function(){
        var worker = false, master = {}, loaded = false;
        var that = function(path){
            var theworker = {}, loaded = false, callings = [];
            theworker.postToWorkerFunction = function(args){
                // try{
                        worker({"data":args});
                // }catch(err){
                //     theworker.onerror(err);
                // }
            };
            theworker.postMessage = function(params){
                if(!loaded){
                    callings.push(params);
                    return;
                }
                theworker.postToWorkerFunction(params);
            };
            master = theworker;
            var scr = document.createElement("SCRIPT");
            scr.src = path;
            scr.type = "text/javascript";
            scr.onload = function(){
                loaded = true;
                while(callings.length > 0){
                    theworker.postToWorkerFunction(callings[0]);
                    callings.shift();
                }
            };
            document.body.appendChild(scr);
            return theworker;
        };
        that.fake = true;
        that.add = function(path, wrk){
            worker = wrk;
            return function(param){
                master.onmessage({"data": param});
            };
        };
        that.toString = function(){
            return "FakeWorker('"+path+"')";
        };
        return that;
    };
    
    var getCrossDomainWorkerFacade = function(){
        var loaded = false, workers = {}, workerCounter = 0, iframeId = "mapnificentCrossDomain",
            targetOrigin = "http://www.mapnificent.net";
        var iframe = window.frames[iframeId];
        if(iframe === undefined){
            iframe = document.createElement("iframe");
            iframe.onload = function(){
                loaded = true;
                for(var workerId in workers){
                    workers[workerId].processQueue();
                }
            };
            iframe.id = iframeId;
            iframe.name = iframeId;
            iframe.src = "http://www.mapnificent.net/static/api/"+options["apiVersion"]+"/mapnificent.html";
            iframe.style.position = "absolute";
            iframe.style.left = "-100000px";
            iframe.style.visibility = "hidden";
            iframe.width = "1";
            iframe.height = "1";
            document.body.appendChild(iframe);
            iframe = window.frames[iframeId];
        }
        var receiveMessage = function(event){
            if (event.origin !== targetOrigin){
                return;
            }
            var data = JSON.parse(event.data);
            workers[data.index][data.command]({data: data.payload});
        };
        window.addEventListener("message", receiveMessage, false); 
        return function(path){
            var queue = [],
            that = {
                "index": workerCounter
                , "processQueue": function(){
                    var obj;
                    obj = queue.pop();
                    while(obj !== undefined){
                        this.postMessage(obj);
                        obj = queue.pop();
                    }
                }
                , "postMessage": function(obj){
                    if (!loaded){
                        queue.push(obj);
                        return;
                    }
                    iframe.postMessage(JSON.stringify({"index": this.index, "command": "postMessage", "payload": obj}), targetOrigin);
                }
                , "terminate": function(){
                    iframe.postMessage(JSON.stringify({"index": this.index, "command": "terminate"}), targetOrigin);
                }
                , "ping": function(){
                    iframe.postMessage(JSON.stringify({"index": this.index, "command": "ping"}), targetOrigin);
                }                    
            };
            workers[workerCounter++] = that;
            return that;
        };
    };
    // this needs to be global
    Workerfacade = undefined;
    if(!!window.Worker){
        if(document.location.hostname.indexOf("www.mapnificent.net") != -1 || debugging){
            WorkerFacade = getRealWorkerFacade();
        }else{
            WorkerFacade = getCrossDomainWorkerFacade();
        }
    } else {
        WorkerFacade = getFakeWorkerFacade();
    }
    
    var debug = {
        log: function(){
            if(!!console){
                console.log(Array.prototype.slice.call(arguments));
            }
        }
        ,error: function(){
            if(!!console){
                console.error(Array.prototype.slice.call(arguments));
            }
        }
    };
        
    var Helper = {
        // taken from jQuery
        merge: function( first, second ) {
            var i = first.length, j = 0;
            while ( second[j] !== undefined ) {
                first[ i++ ] = second[ j++ ];
            }
            first.length = i;
            return first;
        },
        extend: function(obj1, obj2){
            for(var key in obj2){
                obj1[key] = obj2[key];
            }
            return obj1;
        }
    };
    
    var Position = (function(){
        var numberOfCalculations = 0
            ,positions = {}
            ,positionCounter = -1
            ,startPositionsCount = 0
            ,secondSorted = false
            ,calculationsInProgress = 0
            ;
        return {
            "add": function(latlng, time){
                positionCounter += 1;
                startPositionsCount += 1;
                var pos = {
                    "time": time === undefined ? options["maxWalkTime"] : time
                    ,"latlng": latlng
                    ,running: false
                    ,ready: false
                    ,animatedOpacity:0.0
                    ,animatedSeconds: 0
                    ,stationMap: {}
                    ,"calculationProgress": 0
                    ,doneCallback: false
                    ,updateCallback: false
                    ,currentTime: undefined
                    ,"index": positionCounter
                    ,"setTime": function(t){
                        coveredArea = false;
                        this.time = t;
                        this.animatedSeconds = t;
                    }
                    ,"getTime": function(){
                        return this.time;
                    }
                    ,"startCalculation": function(doneclb, updateclb){
                        if (this.running){
                            if(options["calculateOnDrag"]){ return; }
                            var thus = this;
                            this.killWorker();
                        }
                        this.ready = false;
                        if(canCalculate){
                            this.running = true;
                            Event.trigger("calculationStarted", this);
                            this.calculate(doneclb, updateclb);
                        }
                    }
                    ,calculate : function(doneclb, updateclb){
                        calculationsInProgress += 1;
                        coveredArea = false;
                        this.stationMap = {};
                        this.doneCallback = doneclb;
                        this.updateCallback = updateclb;
                        this.currentTime = new Date().getTime();
                        var numberOfClosest = 3
                        ,minDistances=[]
                        ,minStations=[]
                        ,i = 0
                        ,j
                        ,nextStations = []
                        ,distances = []
                        ,indizes;
                        try{
                            while(i<=1 || nextStations.length == 0){
                                indizes = getBlockIndizesForPositionByRadius(this["latlng"], i);
                                for(j=0;j<indizes.length;j+=1){
                                    if(blockGrid[indizes[j][0]][indizes[j][1]].length>0){
                                        nextStations = Helper.merge(nextStations, blockGrid[indizes[j][0]][indizes[j][1]]);
                                    }
                                }
                                i += 1;
                                if(nextStations.length>10){
                                    i += 1;
                                }
                            }
                        } catch(e) {}
                        for(i=0;i<nextStations.length;i++){
                            distances.push(mapnificent.getDistanceInKm(this["latlng"], {lat:stations[nextStations[i]]["a"], lng:stations[nextStations[i]]["n"]}));
                        }
                        this.webworker.postMessage({"fromStations": nextStations
                            ,"blockGrid": blockGrid
                            ,"position": this["latlng"]
                            ,"stations": stations
                            ,"lines": lines
                            ,"distances": distances
                            ,"reportInterval": options["reportInterval"]
                            ,"intervalKey": options["intervalKey"]
                            ,"maxWalkTime": options["maxWalkTime"]
                            ,"secondsPerKm": options["secondsPerKm"]
                        });
                    }
                    ,afterCalculate: function(){
                        // var diff = new Date().getTime() - startPositions[index].currentTime;
                        secondSorted = false;
                        calculationsInProgress -= 1;
                        numberOfCalculations += 1;
                        if(options["animatedAreaOpacity"]){
                            this.animatedOpacity = 0.0;
                        } else {
                            this.animatedOpacity = 1.0;
                        }
                        if(options["animateAreaGrowth"]){
                            this.animatedSeconds = 0;
                        } else {
                            this.animatedSeconds = this.time;
                        }
                        this.running = false;
                        this.ready = true;
                        if(this.doneCallback){
                            this.doneCallback.call(this);
                        }
                        Event.trigger("calculationDone", this);
                    }
                    ,createWorker: function(){
                        this.webworker = WorkerFacade(options["workerURL"]);
                        this.webworker["onmessage"] = pos.workerMessage;
                        this.webworker["onerror"] = pos.workerError;
                    }
                    ,"killWorker": function(){
                        this.webworker.terminate();
                        calculationsInProgress -= 1;
                        this.createWorker();
                        this.running = false;
                    }
                    ,"remove": function(){
                        if(this.running){
                            this.killWorker();
                        }
                        this.webworker = null;
                    }
                    ,"move": function(pos, notify){
                        this["latlng"] = {"lat": pos["lat"], "lng": pos["lng"]};
                        if(!that.inRange(pos)){
                            this.stationMap = {};
                            return false;
                        }
                        if(notify){
                            Event.trigger("positionMoved", this);
                        }
                        return true;
                    }
                    ,draw: function(ctx, pos, stationId, pixelPerSecond, fullpath, prefunc){
                        if(stationId){
                            if (this.stationMap[stationId] == undefined){return;}
                            if(this.stationMap[stationId] >= this.animatedSeconds){return;}
                        }
                        pos = pos || {"lat":this["latlng"].lat, "lng":this["latlng"].lng};
                        if(!fullpath && !options["intersection"]){
                            ctx.beginPath();
                        }
                        var reachableIn = !!stationId ? this.stationMap[stationId] : 0;
                        var secs = Math.min((this.animatedSeconds - reachableIn), options["maxWalkTime"]);
                        var radius = Math.max(secs * pixelPerSecond, 1);
                        var nxy = mapnificent.getCanvasXY(pos);
                        if(prefunc){
                            prefunc(ctx, pos, reachableIn, secs, nxy, radius);
                        }
                        ctx.moveTo(nxy.x,nxy.y);
                        ctx.arc(nxy.x,nxy.y,radius, 0, mapnificent.env["circleRadians"], true);
                        if(!fullpath && !options["intersection"]){
                            ctx.fill();
                        }
                    }
                    ,getGeoJson: function(){
                        var geojson = {
                          "type": "FeatureCollection",
                          "features": null
                        };
                        var features = [];

                        var secs = Math.min(this.animatedSeconds, options["maxWalkTime"]);
                        var radius = secs * (1/options["secondsPerKm"]) * 1000;

                        features.push({
                          "type": "Feature",
                          "properties": {
                            "radius": radius
                          },
                          "geometry": {
                            "type": "Point",
                            "coordinates": [this["latlng"].lng, this["latlng"].lat],
                          },
                        });

                        for (var i=0; i<stationList.length;i++){
                            var stationId = stationList[i];
                            var station = stations[stationId];
                            if (station["a"] === undefined){continue;}
                            if(stationId){
                                if (this.stationMap[stationId] == undefined){continue;}
                                if(this.stationMap[stationId] >= this.animatedSeconds){continue;}
                            }
                            pos = pos || {"lat":this["latlng"].lat, "lng":this["latlng"].lng};
                            var reachableIn = !!stationId ? this.stationMap[stationId] : 0;
                            secs = Math.min((this.animatedSeconds - reachableIn), options["maxWalkTime"]);
                            radius = secs * (1/options["secondsPerKm"]) * 1000;
                            features.push({
                              "type": "Feature",
                              "properties": {
                                "radius": radius
                              },
                              "geometry": {
                                "type": "Point",
                                "coordinates": [station['n'], station['a']],
                              },
                            });
                        }
                        geojson.features = features;
                        var w = window.open('', 'wnd');
                        w.document.body.innerHTML = JSON.stringify(geojson);
                    }
                };
                pos.workerMessage = function(event){
                    if(event.data["status"] == "done"){
                        pos.stationMap = event.data["stationMap"];
                        pos.afterCalculate();
                    } else if (event.data["status"] == "working"){
                        pos["calculationProgress"] = event.data["at"];
                        if(pos.updateCallback){
                            pos.updateCallback.call(pos, event.data["at"]);
                        }
                        Event.trigger("calculationUpdated", pos);
                    }
                };
                pos.workerError = function(error){
                    debug.error(pos, "Worker: "+error.message, error);
                    throw error;
                };
                pos.createWorker();
                positions[positionCounter] = pos;
                return pos;
            }
            ,remove: function(index){
                if(!positions[index]){return false;}
                startPositionsCount -= 1;
                secondSorted = false;
                positions[index]["remove"]();
                delete positions[index];
                Event.trigger("positionRemoved", index);
                return true;
            }
            ,calculateAll: function(){
                for(var index in positions){
                    positions[index]["startCalculation"]();
                }
            }
            ,killAll: function(){
                for(var index in positions){
                    positions[index]["killWorker"]();
                }                
            }
            ,calculateNeeded: function(){
                for(var index in positions){
                    if(!positions[index].ready && !positions[index].running){
                        positions[index]["startCalculation"]();
                    }
                }
            }
            ,draw: function(ctx, fullpath){
                var count = 0;
                var pixPerSeconds = (1/options["secondsPerKm"]) * options["pixelPerKm"];
                for (var index in positions){
                    var pos = positions[index];
                    if (!pos.ready){continue;}
                    ctx.fillStyle = options["drawColor"];
                    if(count == 1 && options["intersection"]){
                        ctx.globalCompositeOperation = "destination-in";
                    }
                    ctx.beginPath();
                    pos.draw(ctx, null, null, pixPerSeconds, true);
                    if(!fullpath && !options["intersection"]){
                        ctx.fill();
                    }
                    for (var i=0; i<stationList.length;i++){
                        var stationId = stationList[i];
                        var station = stations[stationId];
                        if (station["a"] === undefined){continue;}
                        pos.draw(ctx, {"lat":station["a"], "lng":station["n"]}, stationId, pixPerSeconds, fullpath);
                    }
                    if(fullpath || options["intersection"]){
                        ctx.fill();
                    }
                    count += 1;
                }
            }
            ,getFastestStationsWithIndex: function(){
                var sml = [];
                for (var i=0; i<stationList.length;i++){
                    var smallestIndex = false, smallestSecond = Infinity;
                    for(var index in positions){
                        if(typeof(positions[index].stationMap[stationList[i]]) !== "undefined" &&
                                positions[index].stationMap[stationList[i]] < smallestSecond){
                            smallestSecond = positions[index].stationMap[stationList[i]];
                            smallestIndex = index;
                        }
                    }
                    if (smallestIndex !== false){
                        sml.push([smallestIndex, smallestSecond, stationList[i]]);
                    }
                }
                return sml;
            }
            ,drawColor: function(ctx){
                if(secondSorted == false){
                    secondSorted = this.getFastestStationsWithIndex();
                    secondSorted.sort(function(a,b){
                        return ((a[1] < b[1]) ? -1 : ((a[1] > b[1]) ? 1 : 0));
                    });
                }
                var pixPerSeconds = (1/options["secondsPerKm"]) * options["pixelPerKm"];
                var addSecondGradient = function(ctx, pos, seconds, secs, nxy, radius){
                    var grad = ctx.createRadialGradient(nxy.x,nxy.y,0,nxy.x,nxy.y,radius);  
                    grad.addColorStop(0, getColorFor(seconds));
                    grad.addColorStop(0.5, getColorFor(Math.floor(seconds + (secs/2))));
                    grad.addColorStop(1, getColorFor(seconds+secs));
                    ctx.fillStyle = grad;
                };
                for(var i=(secondSorted.length-1); i>=0;i--){
                    var stationId = secondSorted[i][2];
                    var index = secondSorted[i][0];
                    var station = stations[stationId];
                    if (station["a"] == undefined){continue;}
                    if (positions[index].stationMap[stationId] > secondSorted[i][1]){continue;}
                    ctx.beginPath();
                    positions[index].draw(ctx, {lat:station["a"], lng:station["n"]}, stationId, pixPerSeconds, false, addSecondGradient);
                    ctx.fill();
                }
            }
            ,getCalculationsInProgress: function(){
                return calculationsInProgress;
            }
            ,getStationMapData: function(){
                var d = [];
                for (var index in positions){
                    d.push(positions[index].stationMap);
                }
                return d;
            }
        };
    }());
    
    that["getStationMapData"] = Position.getStationMapData;
    
    that["search"] = (function(that){
        var UnionFind = function(){
            /* taken from http://code.activestate.com/recipes/215912/ licensed under PSF License*/
            var num_weights = {}
                , parent_pointers = {}
                , num_to_objects = {}
                , objects_to_num = {}
                , object_num = 0;
            return {
                "insertObjects": function(objects){
                    for (var i=0;i<objects.length;i++){
                        this.find(objects[i]);
                    }
                }
                ,"find": function(object){
                    if (objects_to_num[object] === undefined){
                        num_weights[object_num] = 1;
                        objects_to_num[object] = object_num;
                        num_to_objects[object_num] = object;
                        parent_pointers[object_num] = object_num;
                        object_num += 1;
                        return object;
                    }
                    var stk = [objects_to_num[object]];
                    var par = parent_pointers[stk[stk.length - 1]];
                    while (par != stk[stk.length - 1]){
                        stk.push(par);
                        par = parent_pointers[par];
                    }
                    for (var i=0; i<stk.length;i++){
                        parent_pointers[stk[i]] = par;
                    }
                    return num_to_objects[par];
                }
                ,"union": function(object1, object2){
                    var o1p = this.find(object1);
                    var o2p = this.find(object2);
                    if (o1p != o2p){
                        var on1 = objects_to_num[o1p];
                        var on2 = objects_to_num[o2p];
                        var w1 = num_weights[on1];
                        var w2 = num_weights[on2];
                        if (w1 < w2){
                            var tmp;
                            tmp = o2p;
                            o2p = o1p;
                            o1p = tmp;
                            tmp = on2;
                            on2 = on1;
                            on1 = tmp;
                            tmp = w2;
                            w2 = w1;
                            w1 = tmp;
                        }
                        num_weights[on1] = w1+w2;
                        delete num_weights[on2];
                        parent_pointers[on2] = on1;
                    }
                }
                ,"getRegions": function(){
                    var sets = {}, i;
                    for (i=0;i<object_num;i++){
                        sets[i] = [];
                    };
                    for (i in objects_to_num){
                        sets[objects_to_num[this.find(i)]].push(i);
                    }
                    var out = [];
                    for (i in sets){
                        if (sets[i].length > 0){ 
                            out.push(sets[i]);
                        }
                    }
                    return out;
                }
            };
        };
    
        return {
            "detectBlobs": function(){
                var image = that.getImageData();
                var labels = {};
                var pix = image.data;
                var w = image.width;
                var h = image.height;
                var regionCounter = 0;
                var uf = UnionFind();
                var colorCheck;
                if(that.getOption("color")){
                    colorCheck = function(x){ return x !== 0;};
                } else {
                    colorCheck = function(x){ return x === 0;};
                }
                for (var j=0; j<h;j++){
                    for (var i=0; i<w;i++){
                        var current = i*4+j*w*4+3;
                        if (colorCheck(pix[current])){
                            if(colorCheck(pix[current - 4]) && colorCheck(pix[current - (w*4)])){
                                if(uf.find(current - 4) === uf.find(current - (w*4))){
                                    uf.find(current);
                                    uf.union(current, current-4);
                                }else {
                                    uf.union(current-4, current - (w*4));
                                    uf.find(current);
                                    uf.union(current, current-4);
                                }
                            } else if(colorCheck(pix[current - 4])){
                                uf.find(current);
                                uf.union(current, current-4);
                            } else if(colorCheck(pix[current - (w*4)])){
                                uf.find(current);
                                uf.union(current, current - (w*4));
                            } else {
                                uf.find(current);
                            }
                        }
                    }
                }
                var regions = uf.getRegions();

                var blobs = [];
                // mapnificent.ctx.strokeStyle = "#ff0000";
                // mapnificent.ctx.save();
                for(i = 0; i<regions.length; i++){
                    var maxx = -Infinity, maxy = -Infinity, minx = Infinity, miny = Infinity;
                    var sumx = 0, sumy = 0;
                    var points = [];
                    for(j = 0; j<regions[i].length; j++){
                        var point = parseInt(regions[i][j], 10);
                        var y = Math.floor(((point-3)/4)/w);
                        var x = ((point-3)/4) % w;
                        maxx = Math.max(x, maxx);
                        maxy = Math.max(y, maxy);
                        minx = Math.min(x, minx);
                        miny = Math.min(y, miny);
                        sumx += x;
                        sumy += y;
                        points.push([x,y]);
                    }
                    var midx = sumx/regions[i].length;
                    var midy = sumy/regions[i].length;
                    blobs.push({points: points
                        , maxx: maxx
                        , minx: minx
                        , maxy: maxy 
                        , miny: miny 
                        , midx: midx
                        , midy: midy
                        , sum: regions[i].length
                        , sqkm: that.numberOfPixelsToSqkm(points.length)
                        , midgeo: mapnificent.getCanvasXY(midx, midy)
                        });
                    // mapnificent.ctx.strokeRect(minx,miny,maxx-minx,maxy-miny);
                    // mapnificent.ctx.fillRect(midx-3, midy-3, 6,6);
                    // mapnificent.ctx.fillText(mapnificent.numberOfPixelsToSqkm(points.length), minx,miny);
                }
                // mapnificent.ctx.restore();
                return blobs;
            }
        };
    }(that));
    
    that["addPosition"] = function(latlng, time){
        if(!that.inRange({"lat":latlng.lat, "lng":latlng.lng})){
            return false;
        }
        return Position.add(latlng, time);
    };
    
    that["inRange"] = function(pos) {
        if (pos.lat>options["northwest"]["lat"] || pos.lat<options["southeast"]["lat"] || 
            pos.lng<options["northwest"]["lng"] || pos.lng>options["southeast"]["lng"]) {return false;}
        return true;
    };

    
    that["getCalculationsInProgress"] = function(){
        return Position.getCalculationsInProgress();
    };
    
    var getBlockIndizesForPosition = function(lat, lng) {
        var indexX = Math.floor((options["widthInKm"] / options["latLngDiffs"]["lng"] * (lng - options["northwest"]["lng"])) / blockSize);
        var indexY = Math.floor((options["heightInKm"] / options["latLngDiffs"]["lat"] * (options["northwest"]["lat"] - lat)) / blockSize);
        return [indexX, indexY];
    };
    var getAlternativeBlockIndizesForPosition = function(lat, lng) {
        var indexX = Math.floor(mapnificent.getDistanceInKm(pos,{"lat": lat, "lng": options["northwest"]["lng"]}) / blockSize);
        var indexY = Math.floor(mapnificent.getDistanceInKm(pos,{"lat": options["northwest"]["lat"], "lng":lng}) / blockSize);
        return [indexX, indexY];
    };
    
    var getBlockIndizesForPositionByRadius = function(pos, rad, all) {
        var indizes = getBlockIndizesForPosition(pos["lat"], pos["lng"]);
        if(rad === 0){
            return [indizes];
        }
        var results = [], nearestObjects = [], start, maxDistanceToEdge, nx, ny;
        // maxDistanceToEdge = Math.max(Math.abs(blockCountX-indizes[0]), Math.abs(indizes[1]-blockCountY));
        if(!!all){
            start = 0;
        } else {
            start = rad;
        }
        // for(var i=start;i<maxDistanceToEdge;i++){
        var i = start;
        for (var j=-i;j<(i+1);j++){
            nx = indizes[0]-i;
            ny = indizes[1]+j;
            if(nx>=0 && ny < blockCountY && ny > 0){
                results.push([nx,ny]);
            }
            nx = indizes[0]+i;
            ny = indizes[1]+j;
            if(nx < blockCountX && ny < blockCountY && ny > 0){
                results.push([nx,ny]);
            }
            if(j>-i && j<i){
                nx = indizes[0]+j;
                ny = indizes[1]-i;
                if(nx < blockCountX && nx > 0 && ny >= 0){
                    results.push([nx,ny]);
                }
                nx = indizes[0]+j;
                ny = indizes[1]-i;
                if(nx < blockCountX && nx > 0 && ny >= 0){
                    results.push([nx,ny]);
                }
            }
        }
        //     break; // algorithm change: break here, wait for next round. I miss iterators.
        // }
        return results;
    };
    
    that["setOption"] = function(key, value){
        options[key] = value;
    };
    
    that["setOptions"] = function(opts){
        Helper.extend(options, opts);
    };
    that["getOption"] = function(key){
        return options[key];
    };
    that["getDefaultOption"] = function(key){
        return localDefault[key];
    };

    that["hasOptionChanged"] = function(key){
        return options[key] === localDefault[key];
    };
    that["getTitle"] = function(){
        return "Urban Distance";
    };
    
    that["bind"] = function(name, fnc){
        Event.bind(name, fnc);
    };
    that["unbind"] = function(name, fnc){
        Event.unbind(name, fnc);
    };

    
    that["getCoveredArea"] = function(){
        if (coveredArea === false){
            var image = that["getImageData"]();
            var pix = image.data;
            var w = image.width;
            var h = image.height;
            var tmp = 0;
            for (var j=0; j<h;j++){
                for (var i=0; i<w;i++){
                    if (pix[i*4+j*w*4+3] === 0){
                        tmp += 1;
                    }
                }
            }
            coveredArea = tmp;
        }
        return coveredArea;
    };
    
    that["getImageData"] = function(){
        if(!imageData){
            imageData = mapnificent.ctx.getImageData(0, 0, 
                    mapnificent.canvas.width, mapnificent.canvas.height);
        }
        return imageData;
    };
    
    that["isHighlighted"] = function(x,y){
        var image = that["getImageData"]();
        x = Math.floor(x);
        y = Math.floor(y);
        var trans = image.data[((y*(image.width*4)) + (x*4)) + 3];
        if(that.getOption("color")){
            return trans !== 0;
        } else {
            return trans === 0;
        }
    };
    
    that["getDrawingLevel"] = function(){
        return 0;
    };
    
    that["setup"] = function(controlcontainer, userOptions){
        for (var key in userOptions){
            options[key] = userOptions[key];
        }
        options["reportInterval"] = Math.round(options["estimatedMaxCalculateCalls"]/20);
        options["southwest"] = {"lat":options["southeast"]["lat"], "lng":options["northwest"]["lng"]};
        options["northeast"] = {"lat":options["northwest"]["lat"], "lng":options["southeast"]["lng"]};
        options["latLngDiffs"] = {"lat": Math.abs(options["northwest"]["lat"]-options["southeast"]["lat"]) , "lng": Math.abs(options["northwest"]["lng"]-options["southeast"]["lng"])};
        options["widthInKm"] = mapnificent.getDistanceInKm(options["northwest"], options["northeast"]);
        options["heightInKm"] = mapnificent.getDistanceInKm(options["northwest"], options["southwest"]);
        blockCountX = Math.ceil(options["widthInKm"] / blockSize);
        blockCountY = Math.ceil(options["heightInKm"] / blockSize);
        that["calculatePixelPerKm"]();
        mapnificent.bind("zoom", that["calculatePixelPerKm"]);
        Event.trigger("setup", that);
        startLoading();
    };
    
    that["calculatePixelPerKm"] = function(){
        options["southeastxy"] = mapnificent.getDivXY(options["southeast"]);
        options["northwestxy"] = mapnificent.getDivXY(options["northwest"]);
        options["southwestxy"] = mapnificent.getDivXY(options["southwest"]);
        options["northeastxy"] = mapnificent.getDivXY(options["northeast"]);
        options["map_width"] = Math.abs(options["southwestxy"]["x"] - options["northeastxy"]["x"]);
        options["map_height"] = Math.abs(options["southwestxy"]["y"] - options["northeastxy"]["y"]);
        options["pixelPerKm"] = options["map_width"]/options["widthInKm"];
    };
    
    that["numberOfPixelsToSqkm"] = function(numpix){
        return Math.round(numpix*((1/options["pixelPerKm"])*(1/options["pixelPerKm"]))*100)/100;
    };

    
    that["removePosition"] = function(index){
        Position.remove(index);
    };
    
    var loadFromCache = function(){
        var data;
        if(!!localStorage){
            try{
                data = localStorage.getItem(options["cityData"]);
            } catch(e){
                return false;
            }
            if (data != null){
                try{
                    data = JSON.parse(data);
                    stations = data[0];
                    lines = data[1];
                } catch(e){
                    return false;
                }
                dataLoaded(true);
                return true;
            }
        }
        return false;
    };
    
    var startLoading = function(){
        if(!loadFromCache()){
            loadDataPart(1);
        }
    };
    
    var loadDataPart = function(index){
        loadDataScript(options["dataUrlPrefix"]+options["cityData"]+"-"+index+".json", 
            function(){ loadPartComplete(index); });
    };
    
    var loadPartComplete = function(index){
        var data = mapnificent.getLayerData(that["idname"], index-1);
        if(!!data[2]){
            stations = Helper.extend(stations, data[2]);
        }
        if(!!data[3]){
            lines = Helper.extend(lines, data[3]);
        }
        var percent = Math.round(data[0]/data[1] * 100);
        if (data[0] < data[1]){
            Event.trigger("loadProgress", percent);
            loadDataPart(data[0] + 1);
        } else {

            Event.trigger("loadProgress", percent);
            window.setTimeout(function(){
               dataLoaded(); 
            }, 100);
        }
    };
    
    var loadDataScript = function(url, callback, errback){
        var script = document.createElement("SCRIPT");
        script.type = "text/javascript";
        script.async = "true";
        script.src = url;
        if (errback){
            script.onerror = errback;
        }
        script.onload = callback;
        document.getElementsByTagName('head')[0].appendChild(script);
    };
    
    var dataLoaded = function(fromCache){
        if(fromCache === undefined && !!localStorage){
            try {
                localStorage.clear();
                localStorage.setItem(options["cityData"], JSON.stringify([stations, lines]));
            } catch (e) {}
        }
        blockGrid = [];
        for(var j=0;j<=blockCountX;j+=1){
            blockGrid.push([]);
            for(var k=0;k<=blockCountY;k+=1){
                blockGrid[j].push([]);
            }
        }
        stationList = [];
        // var maxlat = -9999999, minlat=9999999999, maxlng = -9999999999, minlng = 9999999999;
        for(var stationId in stations){
            stationList.push(stationId);
            // maxlat = Math.max(maxlat, stations[stationId]["a"]);
            // minlat = Math.min(minlat, stations[stationId]["a"]);
            // maxlng = Math.max(maxlng, stations[stationId]["n"]);
            // minlng = Math.min(minlng, stations[stationId]["n"]);
            var indizes = getBlockIndizesForPosition(stations[stationId]["a"],stations[stationId]["n"]);
            // if(indizes[0] === undefined || isNaN(indizes[0]) || indizes[1] === undefined || isNaN(indizes[1])){
            //     debug.log("Danger:", stationId, indizes);
            // }
            // debug.log(indizes[0], indizes[1], stations[stationId]["a"], stations[stationId]["n"]);
            blockGrid[indizes[0]][indizes[1]].push(stationId);
        }
        // debug.log(maxlat, minlat, maxlng, minlng);
        // return;
        canCalculate = true;
        Position.calculateNeeded();
        Event.trigger("dataLoaded", that);
    };
    
    var getColorFor = function(secs){
        min = Math.floor(secs / 60);
        if(min == 0){min = 1;}
        if(colorCache[min] === undefined){
            colorCache[min] = "hsla("+(options["colorBaseGradientColor"] - Math.floor(min/options["colorMaxAcceptableTime"]*(options["colorBaseGradientColor"]+options["colorMaxGradientColor"])))+", 100%, 50%, 0.75)";
        }
        return colorCache[min];
    };
    
    var fillGreyArea = function(ctx){
        if(options["intersection"]){
            ctx.globalCompositeOperation = "source-out";
        } else {
            ctx.globalCompositeOperation = "source-over";
        }
        if(mapnificent.map.getMapTypeId() === "Night"){
            options["darkOverlayColor"] = "rgba(0,0,0,0.8)";
        } else {
            if (options["dayTimeEnabled"]){
                if(options["intervalKey"][1] === "0" || options["intervalKey"][1] === "4"){
                    options["darkOverlayColor"] = "rgba(0,0,0,0.8)";
                } else {
                // var trans = 0.75 - Math.sin(options["dayTimeSliderPos"]/180)/2.3;
                    options["darkOverlayColor"] = localDefault["darkOverlayColor"];
                }
            }
        }
        ctx.fillStyle = options["darkOverlayColor"];
        ctx.fillRect(0,0,mapnificent.canvas.width,mapnificent.canvas.height);
    };
    
    var drawBounds = function(ctx, light){
        ctx.save();
        ctx.globalAlpha = 0.7;
        if(!light){
            ctx.strokeStyle = "#333";
        } else {
            ctx.strokeStyle = "#fff";
        }
        ctx.lineWidth = 1;
        ctx.beginPath();  
        var nwxy = mapnificent.getCanvasXY(options["northwest"])
           , nexy = mapnificent.getCanvasXY(options["northeast"])
           , sexy = mapnificent.getCanvasXY(options["southeast"]) // haha
           , swxy = mapnificent.getCanvasXY(options["southwest"])
           ;
        ctx.moveTo(nwxy.x, nwxy.y);
        ctx.lineTo(nexy.x, nexy.y);
        ctx.lineTo(sexy.x, sexy.y);
        ctx.lineTo(swxy.x, swxy.y);
        ctx.lineTo(nwxy.x, nwxy.y);
        ctx.stroke(); 
        ctx.restore();
    };
    
    var redrawTransparent = function(ctx){
        if(!options["intersection"]){
           fillGreyArea(ctx);
           drawBounds(ctx);
           ctx.globalCompositeOperation = "destination-out";
        } else {
            ctx.globalCompositeOperation = "source-over";
        }
        
        var fullpath = options["isOpera"] ? true : false;
        Position.draw(ctx, fullpath);
        if(options["intersection"]){
            fillGreyArea(ctx);
        }
    };
    
    that["calculateAll"] = function(){
        Position.calculateAll();
    };
    
    var redrawColor = function(ctx){
        drawBounds(ctx, true);
        Position.drawColor(ctx);
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(255,255,255,1)";
        ctx.fillRect(0,0,mapnificent.canvas.width,mapnificent.canvas.height);
        ctx.restore();
    };
    
    that["redraw"] = function(ctx){
        imageData = null;
        ctx.save();
        if (options["color"]){
            redrawColor(ctx);
        } else {
            redrawTransparent(ctx);
        }
        ctx.restore();
    };
    
    that["destroy"] = function(){
        Position.killAll();
    };
    
    return that;
});