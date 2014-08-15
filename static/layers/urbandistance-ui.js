var UrbanDistanceUI = function(mapnificent, that, $, window, undefined){
    var startPositions = {}
        ,startPositionsCount = 0
        ,idname = that.idname
        ,geocoder = new google.maps.Geocoder()
        ,lastStartPositionIndex
        ,highlightedIconUrl = "http://gmaps-samples.googlecode.com/svn/trunk/markers/green/blank.png"
        ,normalIconUrl = "http://gmaps-samples.googlecode.com/svn/trunk/markers/orange/blank.png";
        
    var options = {
        "darkOverlayColorDay": "rgba(50,50,50,0.4)"
        , "darkOverlayColorNight": "rgba(0,0,0,0.7)"
    };
    
    that.bind("setup", function(){
        $('#'+idname+'-loading').show().progressbar({
            value: 0
        });
        appendControlHtmlTo();
        $.address.externalChange(hashChange);
        displayPendingLoad(false);
        $('#'+idname+'-loading').progressbar("value", 0);
    });
    
    that.bind("loadProgress", function(progress){
        $('#'+idname+'-loading').progressbar( "value" , progress);
        if(progress >= 100){
            displayPendingLoad(true);
        }
    });
    
    that.bind("dataLoaded", function(){
        $('#'+idname+'-loading').hide();
        hashChange({setup: true, parameters: $.address.parameters()});
        var pos;
        if(startPositionsCount === 0){
            pos = addPosition(that.getOption("defaultStartAtPosition"));
        } else if(lastStartPositionIndex !== undefined){
            pos = startPositions[lastStartPositionIndex].position;
        }
        if(pos){
            openPositionWindow(pos.index)();
        }
        window.setTimeout(function(){
            $("#controls").animate({
                bottom: '20px',
                right: '-5px'
            }, 1500);
        }, 500);
    });
    
    that.bind("positionMoved", function(pos){
        pos.startCalculation();
        updatePositionHash(pos.index);
        startPositions[pos.index].latlng = pos.latlng;
        moveMarkerTo(startPositions[pos.index].marker, pos.latlng);
        getAddressForPoint(pos.latlng, setAddressForPosition(pos));
        updatePositionHash(pos.index);
    });
    
    that.bind("positionRemoved", function(index){
        startPositionsCount -= 1;
        if(startPositionsCount == 0){
            $("#"+idname+'-positionContainer').text("Drag a marker from the top bar onto the map!");
        }
        $("#"+idname+'-'+index).remove();
        startPositions[index].infowindow.close();
        removeMarker(startPositions[index].marker);
        $.address.deleteParameters(["lat"+index, "lng"+index, "t"+index]);
        delete startPositions[index];
        mapnificent.trigger("redraw");
    });
    
    that.bind("calculationStarted", function(position){
        var index = position.index;
        startPositions[index].calculating = true;
        if(that.getOption("calculateOnDrag")){ return; }
        $('.'+idname+'-'+index+'-geojson').hide();
        $('#'+idname+'-'+index+'-slider').hide();
        $('#'+idname+'-'+index+'-progressbar')
            .find(".ui-progressbar-value")
            .css("background", "");
        $('#'+idname+'-'+index+'-info').css("visibility", "hidden");
        $('#'+idname+'-'+index+'-progressbar').show();
        highlightPositionArea(index);
    });
    
    that.bind("calculationDone", function(position){
        var index = position.index;
        startPositions[index].calculating = false;
        $('.'+idname+'-'+index+'-geojson').show();
        $('.'+idname+'-'+index+'-geojson').click(function(e){
            e.preventDefault();
            startPositions[index].position.getGeoJson();
        });
        $('#'+idname+'-'+index+'-progressbar').hide();
        $('#'+idname+'-'+index+'-progressbar').progressbar( "value" , 0);
        $('#'+idname+'-'+index+'-info').css("visibility","visible");
        $('#'+idname+'-'+index+'-slider').show();
        window.setTimeout(function(){
            unhighlightPositionArea(index);
            if(that.getCalculationsInProgress() > 0){
                highlightPositionArea();
            }
        }, 3000);
        mapnificent.trigger("redraw");
        searchArea();
    });
    
    that.bind("calculationUpdated", function(position){
        var index = position.index;
        var count = position.calculationProgress;
        var max = that.getOption("estimatedMaxCalculateCalls") || 100000;
        that.calculationLoopCount = count;
        if(that.getOption("calculateOnDrag")){return;}
        var percent = count / max * 100;
        if(percent > 99){ percent = 99; }
        if (count > max + that.getOption("reportInterval")){
            $('#'+idname+'-'+index+'-progressbar')
                .find(".ui-progressbar-value")
                .css("background", 'url(/static/img/loading.gif) 40% center no-repeat');
        }
        $('#'+idname+'-'+index+'-progressbar').progressbar( "value" , percent);
    });
    
    google.maps.event.addListener(mapnificent.map, "dragend", function(){updateMapPositionAndZoom();});
    google.maps.event.addListener(mapnificent.map, "zoom_changed", function(){updateMapPositionAndZoom();});
    
    var updateMapPositionAndZoom = function(setnow, lat, lng, zoom){
        if(setnow){
            if(lat !== undefined && lng !== undefined){
                mapnificent.map.setCenter(new google.maps.LatLng(parseFloat(lat), parseFloat(lng)));
            }
            if(zoom !== undefined){
                mapnificent.map.setZoom(parseInt(zoom, 10));
            }
        } else {
            var center = mapnificent.map.getCenter();
            var mapzoom = mapnificent.map.getZoom();
            $.address.parameterMap({"lat": center.lat(), "lng": center.lng(), "zoom": mapzoom});
        }
    };
    
    var updateCoveredArea = function(){
        var numpix = that.getCoveredArea();
        jQuery('#'+that.idname+'-coveredarea').text(numpix+" Pixel ~ "+that.numberOfPixelsToSqkm(numpix)+" sqkm");
    };

    
    var createMarker = function(pos, options) {
        options = options || {};
        options.position = new google.maps.LatLng(pos.lat, pos.lng);
        options.map = mapnificent.map;
        options.title = "";
        var marker = new google.maps.Marker(options);
        return marker;
    };
    
    var addEventOnMarker = function(ev, marker, func) {
        google.maps.event.addListener(marker, ev, func);
    };
    
    var removeMarker = function(marker){
        marker.setMap(null);
    };
    
    var moveMarkerTo = function(marker, pos){
        marker.setPosition(new google.maps.LatLng(pos.lat, pos.lng));
    };
    
    var getPointForAddress = function(address, userCallback) {
        var callback = function(results, status) {
            if (status == google.maps.GeocoderStatus.OK) {
                userCallback(results[0].geometry.location);
            }
        };
        geocoder.geocode({'address': address}, callback);
    };
    
    var getAddressForPoint = function(latlng, userCallback) {
        var callback = function(results, status) {
            if (status == google.maps.GeocoderStatus.OK) {
                userCallback(results[0].formatted_address);
            }
        };
        geocoder.geocode({'latLng': new google.maps.LatLng(latlng.lat, latlng.lng)}, callback);
    };

    
        
     var setPosition = function(pos, index){
         startPositions[index].position.move(pos, true);
         startPositions[index].latlng = {"lat": pos.lat, "lng": pos.lng};
    };
    
    var addPosition = function(latlng, time){
        var position = that.addPosition(latlng, time);
        if(position === false){
            showMessage("Your point is out of the covered area.");
            mapnificent.trigger("redraw");
            return false;
        }
        var index = position.index;
        startPositionsCount += 1;
        lastStartPositionIndex = index;
        var marker = createMarker(latlng, {"draggable":true});
        marker.setZIndex(800);
        marker.setIcon(normalIconUrl);
        startPositions[index] = {"marker": marker, "latlng": latlng, "time": position.time, 
            "calculating": false,
            "address": "Loading...", "infowindow": new google.maps.InfoWindow({content: '<div style="height:110px;margin:8px 0px"><h3>Drag the pin around!</h3>'+
            '<p>Currently at: <span class="'+idname+'-'+index+'-address">Address Loading...<br/></span></p>'+
            '<h3>Or go to an address:</h3><form id="'+idname+'-'+index+'-addressinputform"><input type="text" id="'+idname+'-'+index+'-addressinput" placeholder="Type address here" size="30"/><input type="submit" value="Go"/></form>'+
            '</div>', maxWidth: 250}),
            "position": position, "lock": false};
        google.maps.event.addListener(startPositions[index].infowindow, "domready", function(){
            $('.'+idname+'-'+index+'-address').text(startPositions[index].address);
            $('#'+idname+'-'+index+'-addressinputform').submit(function(e){
                e.preventDefault();
                getPointForAddress($('#'+idname+'-'+index+'-addressinput').val(), function(latlng){
                    if(that.inRange({"lat": latlng.lat(), "lng": latlng.lng()})){
                        position.move({"lat": latlng.lat(), "lng": latlng.lng()}, true);
                        mapnificent.map.panTo(latlng);
                    } else {
                        moveMarkerTo(startPositions[position.index].marker, position.latlng);
                        showMessage("Your point is out of the covered area.");
                        mapnificent.trigger("redraw");
                    }
                });
            });
        });
        getAddressForPoint(latlng, setAddressForPosition(position));
        addEventOnMarker("click", marker, openPositionWindow(index));
        addEventOnMarker("mouseover", marker, highlightMarker(index));
        addEventOnMarker("mouseout", marker, unhighlightMarker(index));
        addEventOnMarker("dragstart", marker, function(){
            setAddressForPosition(position)(" ");
            startPositions[index].infowindow.close();
        });
        if (that.getOption("calculateOnDrag")){
            addEventOnMarker("drag", marker, function(mev){
                if(position.move({"lat": mev.latLng.lat(), "lng": mev.latLng.lng()}, false)){
                    position.startCalculation();
                }
            });
        }
        addEventOnMarker("dragend", marker, function(mev){
            if(that.inRange({"lat": mev.latLng.lat(), "lng": mev.latLng.lng()})){
                position.move({"lat": mev.latLng.lat(), "lng": mev.latLng.lng()}, true);
            } else {
                moveMarkerTo(startPositions[position.index].marker, position.latlng);
                showMessage("Your point is out of the covered area.");
                mapnificent.trigger("redraw");
            }
        });
        updatePositionHash(index);
        addPositionHtml(index);
        position.startCalculation();
        return position;
    };
    
    var removePosition = function(index){
        that.removePosition(index);
    };

    var updateGoby = function(e){
        var newMaxWalkTime, newSecondsPerKm;
        try{
            newMaxWalkTime = parseInt($('#'+idname+'-gotime').val(), 10) * 60;
        } catch(e){
            return;
        }
        var biking = $("#"+idname+'-gobybike').is(":checked");
        if (biking){
            newSecondsPerKm = that.getOption("secondsPerKmBiking");
        } else{
            newSecondsPerKm = that.getOption("secondsPerKmWalking");
        }
        if(newSecondsPerKm != that.getOption("secondsPerKm") || newMaxWalkTime != that.getOption("maxWalkTime")){
            that.setOption("secondsPerKm", newSecondsPerKm);
            that.setOption("maxWalkTime", newMaxWalkTime);
            var remove = [], add = {};
            if(that.getOption("secondsPerKm") === that.getOption("secondsPerKmWalking")){
                remove.push("bike");
            } else {
                add.bike = "true";
            }
            if(that.hasOptionChanged("maxWalkTime")){
                remove.push("maxWalkTime");
            } else {
                add.maxWalkTime = Math.ceil(that.getOption("maxWalkTime")/60);
            }
            $.address.updateParameters(add, remove);
            that.calculateAll();
        }
    };
    
    var updateSlider = function(index){
        return function(e, ui){
            setSecondsForPosition(ui.value * 60, index);
            $.address.parameter("t"+index, ui.value);
        };
    };
    
    var setSecondsForPosition = function(seconds, index){
        if (startPositions[index].lock){return;}
        startPositions[index].lock = true;
        startPositions[index].time = seconds;
        startPositions[index].position.setTime(seconds);
        mapnificent.trigger("redraw");
        $("#"+idname+'-'+index+'-timeSpan').text(Math.round(seconds/60));
        $("#"+idname+'-'+index+'-slider').slider("value", Math.round(seconds/60));
        startPositions[index].lock = false;
    };
    
    var setOptions = function(opts){
        var recalc = false;
        var speed = that.getOption("secondsPerKmWalking");
        if (opts.bike){
            $('#'+idname+'-gobybike').attr("checked", "checked");
            speed = that.getOption("secondsPerKmBiking");
        } else {
            $('#'+idname+'-gobybike').attr("checked", "");
        }
        
        if(that.getOption("secondsPerKm") != speed){
            recalc = true;
        }
        that.setOption("secondsPerKm", speed);
        
        if (that.getOption("maxWalkTime") != opts.maxWalkTime){
            recalc = true;
        }
        that.setOption("maxWalkTime", opts.maxWalkTime);
        $('#'+idname+'-gotime').val(Math.round(opts.maxWalkTime/60));
        
        setColor(opts.color);
        setIntersection(opts.intersection);
        
        return recalc;
    };
    
    var setColor = function(colrd){
        that.setOption("color", colrd);
        if(colrd){
            $('#'+idname+'-color').attr("checked", "checked");
            if($('#'+idname+'-intersection').is(":checked")){
                $('#'+idname+'-intersection').attr("checked", null);
                that.setOption("intersection", false);
            }
        } else {
            $('#'+idname+'-color').attr("checked", null);
        }
    };
    
    var setSecondsForIndex = function(seconds, index){
        startPositions[index].position.setTime(seconds);
        startPositions[index].time = seconds;
        mapnificent.trigger("redraw");
    };
    
    var setIntersection = function(intersct){
        if(!mapnificent.env.hasCompositing){ 
            if(intersct){
                showMessage("This browser does not support intersections! Try Firefox or Opera.");
            }
            return;
        }
        that.setOption("intersection", intersct);
        if(intersct){
            $('#'+idname+'-intersection').attr("checked", "checked");
        } else {
            $('#'+idname+'-intersection').attr("checked", null);
        }
        if(intersct && startPositionsCount < 2){
            showMessage("You need at least two points to see an intersection!");
        }
        if(intersct && $('#'+idname+'-color').is(":checked")){
            $('#'+idname+'-color').attr("checked", null);
            that.setOption("color", false);
        }

    };
    
    var updateOptionsHash = function(){
        if(that.getOption("color")){
            $.address.parameter("color", "true");
        } else {
            $.address.deleteParameters(["color"]);
        }
        if(that.getOption("intersection")){
            $.address.parameter("intersection", "true");
        } else {
            $.address.deleteParameters(["intersection"]);
        }
    };
    
    var dayTimeChanged = function(){
        var day = "m";
        if($("#"+idname+'-daytime-day-sat').is(":checked")){
            day = "a";
        } else if($("#"+idname+'-daytime-day-sun').is(":checked")){
            day = "u";
        }
        var ind = Math.floor($('#'+idname+'-daytimeslider').slider("value")/100);
        if(that.getDefaultOption("intervalKey") != day+ind){
            $.address.parameter("dayTime", day+ind);
        } else {
            $.address.deleteParameters(["dayTime"]);
        }
        if(setDayTime(day+ind)){
            that.calculateAll();
        }
        mapnificent.trigger("redraw");
    };
    
    var setDayTime = function(dt){
        if(!that.getOption("dayTimeEnabled")){return false;}
        var recalc = false;
        var setSlider = false;
        if (that.getOption("intervalKey") !== dt){
            recalc = true;
        }
        that.setOption("intervalKey", dt);
        $("#"+idname+'-daytime-day-mon').attr("checked", null);
        $("#"+idname+'-daytime-day-sat').attr("checked", null);
        $("#"+idname+'-daytime-day-sun').attr("checked", null);
        var day = "mon";
        if(dt[0] === "a"){
            day = "sat";
        } else if (dt[0] === "u"){
            day = "sun";
        }
        $("#"+idname+'-daytime-day-'+day).attr("checked", "checked");
        var ind = parseInt(dt[1],10);
        var time = ind * 100;
        if(ind === 0 || ind === 4){
            mapnificent.setNightTime();
            that.setOption("darkOverlayColor", options["darkOverlayColorNight"]);
        } else {
            mapnificent.setDayTime();
            that.setOption("darkOverlayColor", options["darkOverlayColorDay"]);
        }
        var dayTimeSliderPos = $('#'+idname+'-daytimeslider').slider("value");
        var checkValue = Math.floor(dayTimeSliderPos/100);
        if (checkValue != ind){
            $('#'+idname+'-daytimeslider').slider("value", time);
        }
        return recalc;
    };
    
    var appendControlHtmlTo = function(){
        container = $("#controls");
        container.html(''+
                '<div id="'+idname+'-positionContainer" class="positions"></div>'+
                '<div class="dataloading" id="'+idname+'-loading"></div>'+
            '');
        if($.browser.webkit){
            $("#clear-search").hide();
        }
        $('#'+idname+'-search').change(searchArea);
        $('#'+idname+'-search').click(searchArea);
        $('#'+idname+'-search').keydown(function(e){
            if(searchTypeTimeout !== false){
                window.clearTimeout(searchTypeTimeout);
            }
            if(e.keyCode===13){
                e.preventDefault();
                searchArea();
            } else if($('#'+idname+'-search').val() === ""){
                searchArea();
            } else {
                $("#clear-search").css("visibility", "visible");
            }
            searchTypeTimeout = window.setTimeout(searchArea, 800);
        });
        $("#clear-search").click(function(){
            $('#'+that.idname+'-search').val("");
            searchArea();
        });

        var inter = "";
        if(mapnificent.env.hasCompositing){
            inter = ' readonly="readonly"';
            inter = '<p><label class="'+idname+'-intersection" for="'+idname+'-intersection">Intersect: </label><input'+inter+' class="'+idname+'-intersection" type="checkbox" id="'+idname+'-intersection"/></p>';
        } else {
            inter = '<p>The intersection feature currently only works in Firefox or Opera.</p>';
        }
        
        var add = "";
        if (that.getOption("dayTimeEnabled")){
            add = '<div class="daytime">'+
            '<h4>Experimental: Set Time Of Day and Weekday</h4>'+
            '<div style="float:right; margin:0 10px">'+
            '<input type="radio" class="'+idname+'-daytime-day" name="'+idname+'-daytime-day" id="'+idname+'-daytime-day-mon" value="mon" checked="checked"/><label for="'+idname+'-daytime-day-mon">Mon-Fri</label>'+
            '<input type="radio" class="'+idname+'-daytime-day" name="'+idname+'-daytime-day" id="'+idname+'-daytime-day-sat" value="sat"/><label for="'+idname+'-daytime-day-sat">Saturday</label>'+
            '<input type="radio" class="'+idname+'-daytime-day" name="'+idname+'-daytime-day" id="'+idname+'-daytime-day-sun" value="sun"/><label for="'+idname+'-daytime-day-sun">Sunday</label>'+
            '</div>'+
            '<div>'+
            '<div id="'+idname+'-daytimeslider"></div>'+
            '<div style="width:50%;text-align:justify;font-size:6pt">12AM 3AM 6AM 9AM 12PM 3PM 6PM 9PM 12AM</div></div>'+
            '</div>';
        }
        container.after(''+
            '<div class="contentoverlay" style="display:none" id="configure">'+
            '<a class="close toggle" href="#configure">close</a>'+
            '<h2>Mapnificent Settings</h2>'+
            '<p><label for="'+idname+'-gobybike">Do you have a bike with you? </label>'+
            '<input type="checkbox" class="'+idname+'-goby" id="'+idname+'-gobybike" name="'+idname+'-goby" value="bike"/></p>'+
            '<p><label for="'+idname+'-gotime">Max. time to walk/ride from/to stations: </label><input size="4" type="text" id="'+idname+'-gotime" value="'+Math.floor(that.getOption("maxWalkTime")/60)+'"/> minutes</p>'+
            '<p><label for="'+idname+'-color">Show color map</label>: <input type="checkbox" id="'+idname+'-color"/></p>'+
            inter+add+
            '</div>'+
        '');
        
        $('.'+idname+'-goby').change(updateGoby);
        $('#'+idname+'-gotime').change(updateGoby);
        if (that.getOption("dayTimeEnabled")){
            $('#'+idname+'-daytimeslider').slider({
                value: 100,
                min: 0,
                max: 499,
                animate: true,
                stop: dayTimeChanged
            });
            $("."+idname+'-daytime-day').change(dayTimeChanged);
        }
        $('#'+idname+'-markerrepo').mousedown(function(e){
            e.preventDefault();
        });
        var newMarkerOffset = $('#'+idname+'-markerrepo-marker').offset();
        var newMarkerOptions = {
            stop: function(e){
                var offset = $(this).offset();
                var mapOffset = $(mapnificent.map.getDiv()).offset();                // marker is 34 x 20
                var x = offset.left + 10 - mapOffset.left;
                var y = offset.top + 34 - mapOffset.top;

                $(this).draggable("destroy");
                $(this).offset(newMarkerOffset);
                $(this).draggable(newMarkerOptions);
                if(y < 0) {
                    return;
                }
                var latlng = mapnificent.getLatLngFromWindowXY(x, y);
                addPosition(latlng);
            },
            scroll: false
        };
        $('#'+idname+'-markerrepo-marker').draggable(newMarkerOptions);
        
        if(!mapnificent.env.hasCompositing){
            $('.'+idname+'-intersection').click(function(e){
                showMessage("Your browser does not support intersections, try Firefox or Opera!");
                return;
            });
        } else {
            $('#'+idname+'-intersection').change(function(e){
                intersection = $(this).is(":checked");
                setIntersection(intersection);
                updateOptionsHash();
                mapnificent.trigger("redraw");
            });            
        }
        $('#'+idname+'-color').change(function(e){
            color = $(this).is(":checked");
            setColor(color);
            updateOptionsHash();
            mapnificent.trigger("redraw");
        });
    };
    
    var openPositionWindow = function(index){
        return function(){
            startPositions[index].infowindow.open(mapnificent.map, startPositions[index].marker);
        };
    };
    
    var addPositionHtml = function(index){
        if(startPositionsCount === 1){
            $("#"+idname+'-positionContainer').html("");
        }
        $("#"+idname+'-positionContainer').prepend('<div id="'+idname+'-'+index+'" class="position-container">'+
                '<span style="visibility:hidden" id="'+idname+'-'+index+'-info">At most <strong id="'+idname+'-'+index+'-timeSpan"></strong> minutes '+
                'to any point in the highlighted area (estimate)</span>'+
                ' <small><a href="#" style="display:none" class="'+idname+'-'+index+'-geojson">GeoJSON</a></small>'+
                '<div><input type="button" value="X" id="'+idname+'-'+index+'-remove" class="remove-button"/>'+
                '<div style="display:none" id="'+idname+'-'+index+'-slider"></div>'+
                '<div style="display:none" id="'+idname+'-'+index+'-progressbar"></div>'+ 
                '</div>'+
                '<div style="font-size:9px;" class="'+idname+'-'+index+'-address"></div>'+
                '</div>');
        $('#'+idname+'-'+index).mouseover(highlightMarker(index));
        $('#'+idname+'-'+index).mouseout(unhighlightMarker(index));
        $('#'+idname+'-'+index+'-slider').slider({ min: 0, max: that.getOption("maxWalkTravelTime"),
                     // slide: updateSlider(index),
                     stop: updateSlider(index), 
                     value: Math.round(startPositions[index].time/60),
                     animate: true
                  });
        $('#'+idname+'-'+index+'-progressbar').progressbar({
            value: 0
        });
        $("#"+idname+'-'+index+'-timeSpan').text(Math.round(startPositions[index].time/60));
        $("#"+idname+'-'+index+'-remove').click(function(){
            removePosition(index);
        });
    };
    
    var highlightPositionArea = function(index){
        $("#controls").css("opacity", "1");
        if(index !== undefined){
            $('#'+idname+'-'+index).css('outline', '1px rgb(0,187,11) solid');
            // if(startPositions[index].calculating){
            //     animatePositionBackground(index, false);
            // }
        }
    };
    
    var animatePositionBackground = function(index, white){
        $('#'+idname+'-'+index).animate({ backgroundColor: white ? "#fff" : "#dadada" }, 2000,function(){
            if(startPositions[index].calculating){
                animatePositionBackground(index, !white);
            } else {
                $('#'+idname+'-'+index).css({backgroundColor: '#fff'});
            }
        });
    };
    
    var unhighlightPositionArea = function(index){
        if(that.getCalculationsInProgress() === 0){
            $("#controls").css("opacity", "");
        }
        if(index !== undefined){
            $('#'+idname+'-'+index).css({backgroundColor: '#fff', outline: 'inherit'});
        }
    };
    
    var highlightMarker = function(index){
        return function(){
           highlightPositionArea(index); startPositions[index].marker.setIcon(highlightedIconUrl);
        };
    };
    
    var unhighlightMarker = function(index){
        return function(){
            unhighlightPositionArea(index);
            startPositions[index].marker.setIcon(normalIconUrl);
        };
    };
    
    var setAddressForPosition = function(position){
        return function(adr){
            startPositions[position.index].address = adr;
            $('.'+idname+'-'+position.index+'-address').text(adr);
        }; 
    };

    
    var displayPendingLoad = function(doit){
        highlightPositionArea();
        if(doit){
            $('#'+idname+'-loading').css("background",'url(/static/img/loading.gif) center center no-repeat').progressbar("destroy").show();
        } else {
            $('#'+idname+'-loading').show().css("background",'').progressbar({
                value: 0
            });
        }
    };
    
    var updatePositionHash = function(index){
        var params = {};
        params["lat"+index] = startPositions[index].latlng.lat;
        params["lng"+index] = startPositions[index].latlng.lng;
        params["t"+index] = Math.round(startPositions[index].time/60);
        $.address.parameterMap(params);
        if(currentSearch){
            currentSearch = undefined;
            searchArea();
        }
    };
    
    var showMessage = function(message, keepDisplayed) {
        $("#message").html(message);
        $("#message").fadeIn(200);
        if(!keepDisplayed){
            window.setTimeout(function(){
                if($("#message").css("display") !== "none"){
                    $("#message").fadeOut(400);
                }
            },8500);
        }
    };
    
    var hideMessage = function() {
        $("#message").fadeOut(200);
    };
    
    var hashChange = function(event){
        var params = event.parameters, index, completeRecalc = false;
        var recalc = {}, remove = {};
        updateMapPositionAndZoom(true, params["lat"], params["lng"], params["zoom"]);
        for(index in startPositions){
            recalc[index] = {moved: false};
            if (params["lat"+index] !== undefined){
                recalc[index].lat = parseFloat(params["lat"+index]);
                if(parseFloat(params["lat"+index]) !== startPositions[index].latlng.lat){
                    recalc[index].moved = true;
                }   
            } else if(params["lat"+index] === undefined){
                remove[index] = true;
            }
            if (params["lng"+index] !== undefined){
                recalc[index].lng = parseFloat(params["lng"+index]);
                if(parseFloat(params["lng"+index]) !== startPositions[index].latlng.lng){
                    recalc[index].moved = true;
                }
            } else if(params["lng"+index] === undefined){
                remove[index] = true;
            }
            if (params["t"+index] !== undefined && 
                parseInt(params["t"+index], 10) !== startPositions[index].time){
                    setSecondsForIndex(parseInt(params["t"+index], 10)*60, index);
            }
        }
        for(index in recalc){
            if (remove[index] === undefined && recalc[index].moved){
                setPosition(recalc[index], index);
            }
        }
        for(index in remove){
            removePosition(index);
        }
        var newPositions = {}, searchFor = ["lat", "lng", "t"];
        for(var key in params){
            for(var i=0;i<searchFor.length;i++){
                if(key.indexOf(searchFor[i]) === 0){
                    index = parseInt(key.substring(searchFor[i].length, key.length), 10);
                    if(!isNaN(index) && startPositions[index] === undefined){
                        newPositions[index] = newPositions[index] || {};
                        newPositions[index][searchFor[i]] = parseFloat(params[key]);
                    }
                    break;
                }
            }
        }
        for(index in newPositions){
            addPosition({lat: newPositions[index].lat, lng: newPositions[index].lng}, newPositions[index].t*60);
        }
        var opts = {};
        if(params.maxWalkTime !== undefined){
            opts.maxWalkTime = params.maxWalkTime * 60;
        } else {
            opts.maxWalkTime = that.getDefaultOption("maxWalkTime");
        }
        opts.bike = !!params.bike;
        opts.intersection = params.intersection == "true" ? true : false;
        opts.color = params.color == "true" ? true : false;
        completeRecalc = completeRecalc || setOptions(opts);
        if (that.getOption("dayTimeEnabled")){
            var dt = params.dayTime || that.getDefaultOption("intervalKey");
            completeRecalc = completeRecalc || setDayTime(dt);
        }
        
        if(params.search !== currentSearch){
            setSearch(params.search);
        }
        if(completeRecalc){
            that.calculateAll();
        } else{
            mapnificent.trigger("redraw");
        }
    };
    
    // ####### SEARCH ###################### ###################### ######################
    
    var resultMarker = {}
        , outsideAreaIcon = "/static/img/greymarker.png"
        , insideAreaIcon = "http://gmaps-samples.googlecode.com/svn/trunk/markers/red/blank.png"
        , currentSearch = undefined
        , lastSearchSqkm = 0
        , searchTypeTimeout = false;
        ;
        
    var showSearchIndicator = function(){
        $("#urbanDistance-search-indicator").css("visibility", "visible");
    };
    
    var hideSearchIndicator = function(){
        $("#urbanDistance-search-indicator").css("visibility", "hidden");
    };
    
    var clearSearch = function(){
        for(var id in resultMarker){
            removeMarker(resultMarker[id].marker);
            resultMarker[id].marker = null;
            resultMarker[id].infowindow.close();
            resultMarker[id].infowindow = null;
        }
        resultMarker = {};
    };
    
    var closeAllSearchResultWindows = function(){
        for(var id in resultMarker){
            resultMarker[id].infowindow.close();
        }
    };

    var searchArea = function(){
        if(that.getCalculationsInProgress() > 0){
            return;
        }
        var query = $('#'+that.idname+'-search').val();
        if(query === ""){
            $("#clear-search").css("visibility", "hidden");
            currentSearch = null;
            $("#search-attribution").hide();
            $.address.deleteParameters(["search"]);
            clearSearch();
            mapnificent.unbind("idleAfterRedrawing", updateSearch);
            return;
        }
        if(currentSearch === query){
            return;
        } else {
            clearSearch();
        }
        if(startPositionsCount === 0){
            showMessage("You need at least one starting point!");
            return;
        }
        showSearchIndicator();
        currentSearch = query;
        $.address.parameter("search", currentSearch);
        var blobs = that.search.detectBlobs();
        lastSearchSqkm = that.getCoveredArea();
        var totalPoints = 0;
        var blobsearchers = [];
        for(var i=0; i<blobs.length;i++){
            totalPoints += blobs[i].points.length;
            var sqkm = that.numberOfPixelsToSqkm(blobs[i].points.length);
            blobs[i].sqkm = sqkm;
            if(sqkm <= 0.02 && blobs.length <= 2){ continue; }
            (function(){
                var bsearcher = new google.search.LocalSearch();
                var blobGeoPoint = mapnificent.getLatLngFromCanvasXY(blobs[i].midx, blobs[i].midy);
                // createMarker(blobGeoPoint);
                // return;
                bsearcher.setCenterPoint(new google.maps.LatLng(blobGeoPoint.lat, blobGeoPoint.lng));
                bsearcher.setAddressLookupMode(google.search.LocalSearch.ADDRESS_LOOKUP_ENABLED);
                bsearcher.setResultSetSize(google.search.Search.LARGE_RESULTSET);
                bsearcher.setSearchCompleteCallback(bsearcher, function(){searchComplete.call(this,blobs[i]);});
                bsearcher.execute(query);
            }());
        }
    };

    var setSearch = function(query){
        if(query != null && query != ""){
            $('#'+that.idname+'-search').val(query);
            $("#clear-search").css("visibility", "visible");
        } else {
            $('#'+that.idname+'-search').val("");
            $("#clear-search").css("visibility", "hidden");
        }
    };

    var searchComplete = function(blob){
        var i;
        hideSearchIndicator();
        if(!this.cursor){
            showMessage("Your search returned no results.");
            return;
        }
        if(this.cursor.currentPageIndex === 0){
            var attribution = this.getAttribution();
            var attrDiv = $("#search-attribution");
            if(attribution){
                attrDiv.html(attribution);
                attrDiv.show();
                attrDiv.parent().show();
            }
        }
        addSearchResults(this);
        if(this.cursor && this.cursor.currentPageIndex === 0){
            if(this.cursor.pages[this.cursor.currentPageIndex+1] !== undefined){
                showSearchIndicator();
                this.gotoPage(this.cursor.currentPageIndex+1);
            }
        }
        mapnificent.bind("idleAfterRedrawing", updateSearch);
    };
    
    var updateSearch = function(){
        // if(lastSearchSqkm !== false){
        //     var currentSqkm = that.getCoveredArea();
        //     if (Math.abs(currentSqkm - lastSearchSqkm) > 1){
        //         currentSearch = undefined;
        //         searchArea();
        //     }
        // }
        updateSearchResults();
    };
    
    var updateSearchResults = function(){
        for(var id in resultMarker){
            var xy = mapnificent.getCanvasXY(resultMarker[id].pos);
            if(that.isHighlighted(xy.x, xy.y)){
                resultMarker[id].marker.setIcon(insideAreaIcon);
                resultMarker[id].active = true;
            } else {
                resultMarker[id].marker.setIcon(outsideAreaIcon);
                resultMarker[id].active = false;
            }
        }
    };
    
    var addSearchResults = function(searcher){
        for(i=0; i< searcher.results.length; i++){
            var result = searcher.results[i];
            var markerId = "m"+result.lat+"_"+result.lng;
            if (resultMarker[markerId] !== undefined){
                continue;
            }
            (function(){
                var xy = mapnificent.getCanvasXY({lat: result.lat, lng: result.lng});
                var marker = createMarker({lat: result.lat, lng: result.lng});
                if(that.isHighlighted(xy.x, xy.y)){
                    marker.setIcon(insideAreaIcon);
                } else {
                    marker.setIcon(outsideAreaIcon);
                }
                var infowindow = new google.maps.InfoWindow({content: result.html.cloneNode(true)});
                resultMarker[markerId] = {marker: marker, infowindow: infowindow, pos: {lat: result.lat, lng: result.lng}};
                addEventOnMarker("click", marker, function(){
                    closeAllSearchResultWindows();
                    infowindow.open(mapnificent.map, marker);
                });
            }());
        }
    };
  
};