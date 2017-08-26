var Quadtree = (function(){
'use strict';

var nodeCapacity = 32;

var containsPoint = function(boundary, p) {
  if (p.lng < boundary[0] - boundary[2]) {
    return false;
  }
  if (p.lat < boundary[1] - boundary[3]) {
    return false;
  }
  if (p.lng > boundary[0] + boundary[2]) {
    return false;
  }
  if (p.lat > boundary[1] + boundary[3]) {
    return false;
  }
  return true;
};

var intersectsBoundary = function(boundary, other) {
  if (other[0] + other[2] < boundary[0] - boundary[2]) {
    return false;
  }
  if (other[1] + other[3] < boundary[1] - boundary[3]) {
    return false;
  }
  if (other[0] - other[2] > boundary[0] + boundary[2]) {
    return false;
  }
  if (other[1] - other[3] > boundary[1] + boundary[3]) {
    return false;
  }

  return true;
};

function Quadtree(centerX, centerY, halfdimX, halfdimY) {
  this.boundary = [centerX, centerY, halfdimX, halfdimY];
  this.points = [];
  this.northWest = null;
  this.northEast = null;
  this.southWest = null;
  this.southEast = null;
}

Quadtree.create = function(minLat, maxLat, minLng, maxLng) {
  var halfdimX = (maxLng - minLng) / 2;
  var halfdimY = (maxLat - minLat) / 2;
  var centerX = halfdimX + minLng;
  var centerY = halfdimY + minLat;
  return new Quadtree(centerX, centerY, halfdimX, halfdimY);
};

Quadtree.prototype.insertAll = function(points) {
  for (var i = 0; i < points.length; i += 1) {
    this.insert(points[i]);
  }
};

Quadtree.prototype.insert = function(p) {
  // Ignore objects which do not belong in this quad tree.
  if (!containsPoint(this.boundary, p)) {
    return false;
  }

  // If there is space in this quad tree, add the object here.
  if (this.points !== null && this.points.length < nodeCapacity) {
    this.points.push(p);
    return true;
  }

  // Otherwise, we need to subdivide then add the point to whichever node
  // will accept it.
  if (this.northWest === null) {
    this.subDivide();
  }

  if (this.northWest.insert(p)) {
    return true;
  }
  if (this.northEast.insert(p)) {
    return true;
  }
  if (this.southWest.insert(p)) {
    return true;
  }
  if (this.southEast.insert(p)) {
    return true;
  }

  // Otherwise, the point cannot be inserted for some unknown reason.
  // (which should never happen)
  console.warn('Quadtree: could not insert', p);
};

Quadtree.prototype.subDivide = function() {
  // Check if this is a leaf node.
  if (this.northWest !== null) {
    return;
  }

  this.northWest = new Quadtree(
    this.boundary[0] - this.boundary[2] / 2,
    this.boundary[1] + this.boundary[3] / 2,
    this.boundary[2] / 2,
    this.boundary[3] / 2
  );

  this.northEast = new Quadtree(
    this.boundary[0] + this.boundary[2] / 2,
    this.boundary[1] + this.boundary[3] / 2,
    this.boundary[2] / 2,
    this.boundary[3] / 2
  );

  this.southWest = new Quadtree(
    this.boundary[0] - this.boundary[2] / 2,
    this.boundary[1] - this.boundary[3] / 2,
    this.boundary[2] / 2,
    this.boundary[3] / 2
  );

  this.southEast = new Quadtree(
    this.boundary[0] + this.boundary[2] / 2,
    this.boundary[1] - this.boundary[3] / 2,
    this.boundary[2] / 2,
    this.boundary[3] / 2
  );

  for (var i = 0; i < this.points.length; i += 1) {
    if (this.northWest.insert(this.points[i])) {
      continue;
    }
    if (this.northEast.insert(this.points[i])) {
      continue;
    }
    if (this.southWest.insert(this.points[i])) {
      continue;
    }
    if (this.southEast.insert(this.points[i])) {
      continue;
    }
    console.warn('Quadtree: Subdivide - could not insert point', this.points[i]);
  }
  this.points = null;
};

Quadtree.prototype.searchInRadius = function(lat, lng, radius) {
  var earthRadius = 6371000.0; // in meter
  var x1 = lng - (180.0 / Math.PI * (radius / earthRadius / Math.cos(lat*Math.PI/180.0)));
  var x2 = lng + (180.0 / Math.PI * (radius / earthRadius / Math.cos(lat*Math.PI/180.0)));
  var y1 = lat + (radius / earthRadius * 180.0 / Math.PI);
  var y2 = lat - (radius / earthRadius * 180.0 / Math.PI);
  // FIXME: this is bounding box search, not radial
  return this.searchArea([lng, lat, Math.abs(x1-x2)/2.0, Math.abs(y1-y2)/2.0]);
};

Quadtree.prototype.distanceBetweenCoordinates = function(lat, lng, slat, slng) {
  var EARTH_RADIUS = 6371000.0; // in m
  var toRad = Math.PI / 180.0;
  return Math.acos(Math.sin(slat * toRad) * Math.sin(lat * toRad) +
      Math.cos(slat * toRad) * Math.cos(lat * toRad) *
      Math.cos((lng - slng) * toRad)) * EARTH_RADIUS;

};

Quadtree.prototype.getDistancesInRadius = function(lat, lng, radius, sorted) {
  sorted = (sorted === undefined) || sorted;
  var stops = this.searchInRadius(lat, lng, radius);
  var results = [];
  for (var i = 0; i < stops.length; i += 1) {
    results.push([stops[i], this.distanceBetweenCoordinates(
      lat, lng, stops[i].lat, stops[i].lng)]);
  }
  if (sorted) {
    results.sort(function(a, b){
      if (a[1] > b[1]) {
        return 1;
      } else if (a[1] < b[1]) {
        return -1;
      }
      return 0;
    });
  }
  return results;
};

Quadtree.prototype.searchArea = function(boundary) {
  var results = [];

  if (!intersectsBoundary(this.boundary, boundary)) {
    return results;
  }

  if (this.points !== null) {
    for (var i = 0; i < this.points.length; i += 1) {
      if (containsPoint(boundary, this.points[i])) {
        results.push(this.points[i]);
      }
    }
  }

  if (this.northWest === null) {
    return results;
  }

  results = results.concat(this.northWest.searchArea(boundary));
  results = results.concat(this.northEast.searchArea(boundary));
  results = results.concat(this.southWest.searchArea(boundary));
  results = results.concat(this.southEast.searchArea(boundary));
  return results;
};

return Quadtree;

}());
