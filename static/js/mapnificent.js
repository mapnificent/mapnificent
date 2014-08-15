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
}(window, document, $));