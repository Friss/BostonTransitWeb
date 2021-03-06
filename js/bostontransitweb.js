/*

    Modified and extended by Zachary Friss
    (Currently undergoing refactoring)

    Original file

    Copyright (C) 2013 Abram Connelly

    This file is part of bostontraintrack.

    bostontraintrack is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    bostontraintrack is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with bostontraintrack.  If not, see <http://www.gnu.org/licenses/>.

*/
// VERSION 0.0.1
var g_verbose = 1;
var g_map, g_stop_layer, g_socket;

var g_marker = {};
var g_marker_popup = {};
var g_marker_layer;

var g_dirty = 0;

var g_zoom = 14;

var g_param = {
  bus_w: 36,
  bus_h: 45,
  stop_w: 15,
  stop_h: 18
};

var g_projection = new OpenLayers.Projection("EPSG:4326");

var headingLookup = ["0", "45", "90", "135", "180", "225", "270", "315"];

function drawMarker(tripid, color) {
  var trip = g_marker[tripid];

  // If it exists update it!
  if (trip.hasOwnProperty('osm_marker')) {
    var newLoc = new OpenLayers.LonLat(trip.Long, trip.Lat)
      .transform(
        g_projection,
        g_map.getProjectionObject()
      );
    trip.osm_marker.data.predictionStop = trip.nextStop;
    trip.osm_marker.data.predictionTime = trip.predTime;
    trip.osm_marker.style.externalGraphic = iconURL(trip);
    trip.osm_marker.move(newLoc);
    if (trip.osm_marker.hasOwnProperty('popup') && trip.osm_marker.popup !== null){
      console.log(trip);
      destoryPopUp(trip.osm_marker);
      var popup = createPopUp(trip.osm_marker);
      trip.osm_marker.popup = popup;
      g_map.addPopup(popup);
    }
    return
  }else{

    var scale_factor = 1.0;
    var bus_w = g_param.bus_w;
    var bus_h = g_param.bus_h;

    if ((g_map.zoom <= 13) && (g_map.zoom >= 8)) {
      scale_factor = Math.exp(Math.log(2) * (g_map.zoom - 14));
      bus_w *= scale_factor;
      bus_h *= scale_factor;
    }

    var icon = iconURL(trip);

    trip.osm_marker = new OpenLayers.Feature.Vector(
      new OpenLayers.Geometry.Point(trip.Long, trip.Lat).transform(g_projection, g_map.getProjectionObject()),
      {
        predictionStop: trip.nextStop,
        predictionTime: trip.predTime,
        route: trip.route,
        color: trip.Color,
      },
      {
        externalGraphic: icon,
        graphicHeight: bus_h,
        graphicWidth: bus_w,
        graphicXOffset: -(bus_w / 2),
        graphicYOffset: -bus_h
      }
    );

    if (trip.Color !== "bus") {
      g_marker_layer.addFeatures(trip.osm_marker);
    } else {
      g_marker_layer_buses.addFeatures(trip.osm_marker);
    }
    return
  }
}

function iconURL (trip) {
  var icon;
  var color = trip.Color;
  if ((color === "red") || (color === "blue") || (color === "orange")) {
    var iheading = Math.floor((parseInt(trip.Heading, 10) + 23) / 45);
    if (iheading > 7) {
      iheading = 0;
    }
    icon = "img/metro_" + color + "_" + headingLookup[iheading] + "_fade.png";
  } else {
    icon = "img/" + color + "_fade.png";
  }
  return icon;
}

function updateTrain(data, color) {
  var trips = data[color].TripList.Trips;
  var tripid, x;

  // Mark all entries for deletion
  //
  for (tripid in g_marker) {
    if ((g_marker[tripid].hasOwnProperty("Color")) && (g_marker[tripid].Color === color)) {
      g_marker[tripid].Dirty = 0;
    }
  }

  // Create new entries if they don't exist
  //
  for (x in trips) {
    if (trips[x].hasOwnProperty("Position")) {
      tripid = trips[x].TripID;
      if (!(g_marker[tripid])) {
        g_marker[tripid] = {
          Lat: 0,
          Long: 0,
          Color: color
        };
      }
    }
  }

  // Draw new entries and unmark them for deletion if we're drawing
  // them.
  //
  var lat, lon;
  for (x in trips) {
    if (trips[x].hasOwnProperty("Position")) {

      tripid = trips[x].TripID;

      g_marker[tripid].Timestamp = trips[x].Position.Timestamp;
      g_marker[tripid].Heading = trips[x].Position.Heading;
      g_marker[tripid].Dirty = 1;
      g_marker[tripid].nextStop = trips[x].Predictions[0].Stop;
      if (trips[x].Predictions[0].Seconds > 60) {

        g_marker[tripid].predTime = (trips[x].Predictions[0].Seconds / 60).toFixed(2) + " minutes";
      } else {
        g_marker[tripid].predTime = trips[x].Predictions[0].Seconds + " seconds";
      }

      g_marker[tripid].route = trips[x].Destination;

      lat = trips[x].Position.Lat;
      lon = trips[x].Position.Long;

      if ((Math.abs(lat - g_marker[tripid].Lat) > 0.001) ||
          (Math.abs(lon - g_marker[tripid].Long) > 0.001)) {

        g_marker[tripid].Lat = trips[x].Position.Lat;
        g_marker[tripid].Long = trips[x].Position.Long;

        drawMarker(tripid, color);
      }
    }
  }

  // Delete stale entries
  //
  for (tripid in g_marker) {
    if ((g_marker[tripid].hasOwnProperty("Color")) && (g_marker[tripid].Color === color)) {
      if (g_marker[tripid].Dirty === 0) {
        g_marker_layer.removeFeatures(g_marker[tripid].osm_marker);
        delete g_marker[tripid];
      }
    }
  }
  g_marker_layer.redraw();
}

function updateBus(data, color) {
  var trips = data[color].body.vehicle;
  var tripid, x;

  for (tripid in g_marker) {
    if ((g_marker[tripid].hasOwnProperty("Color")) && (g_marker[tripid].Color === color)) {
      g_marker[tripid].Dirty = 0;
    }
  }

  // Create new entries if they don't exist
  //
  for (x in trips) {
    tripid = trips[x].$.id;
    if (!(g_marker[tripid])) {
      g_marker[tripid] = {
        Lat: 0,
        Long: 0,
        Color: color
      };
    }
  }

  // Draw new entries and unmark them for deletion if we're drawing
  // them.
  //
  var lat, lon;
  for (x in trips) {
    tripid = trips[x].$.id;

    g_marker[tripid].Timestamp = trips[x].$.secsSinceReport;
    g_marker[tripid].Heading = trips[x].$.heading;
    g_marker[tripid].Dirty = 1;
    g_marker[tripid].nextStop = "Coming Soon.";
    g_marker[tripid].predTime = "Coming Soon.";
    g_marker[tripid].route = trips[x].$.routeTag;

    lat = trips[x].$.lat;
    lon = trips[x].$.lon;

    if ((Math.abs(lat - g_marker[tripid].Lat) > 0.001) ||
        (Math.abs(lon - g_marker[tripid].Long) > 0.001)) {

      g_marker[tripid].Lat = trips[x].$.lat;
      g_marker[tripid].Long = trips[x].$.lon;

      drawMarker(tripid, color);
    }
  }

  for (tripid in g_marker) {
    if ((g_marker[tripid].hasOwnProperty("Color")) && (g_marker[tripid].Color === color)) {
      if (g_marker[tripid].Dirty === 0) {
        g_marker_layer_buses.removeFeatures(g_marker[tripid].osm_marker);
        delete g_marker[tripid];
      }
    }
  }
  g_marker_layer.redraw();
}

function rtupdate(data) {

  if (data.red) {
    updateTrain(data, "red");
  }
  if (data.blue) {
    updateTrain(data, "blue");
  }
  if (data.orange) {
    updateTrain(data, "orange");
  }
  if (data.bus) {
    updateBus(data, "bus");
  }

}

var g_SERVER_ADDR = "bostontransitserver.justdev.in";
if (document.location.hostname === "localhost") {
  g_SERVER_ADDR = "localhost:8181";
}


function setupRTStreams() {
  g_socket = io('http://' + g_SERVER_ADDR);
  g_socket.on('connect', function () {
    if (g_verbose) {
      console.log("Connected to server.");
    }
    g_socket.on('update', rtupdate);
    g_socket.on('disconnect', function () {
      console.log("disconnected");
    });
  });
}

function mapEvent(ev) {
  var bus_id;
  if (ev.type === "zoomend") {
    if (g_map.zoom <= 12) {
      for (bus_id in g_marker) {
        drawMarker(bus_id, g_marker[bus_id].Color);
      }
      drawStops();
    } else {
      for (bus_id in g_marker) {
        drawMarker(bus_id, g_marker[bus_id].Color);
      }
      drawStops();
    }
  }
}

function drawStops(force) {
  var ind;
  if (!force) {
    if (g_map.zoom < 8) {
      return;
    }
  }

  var st, lonlat, scale_factor, stop_w, stop_h, size, offset, icon, stopMarker, code;
  for (ind in g_stops) {
    st = g_stops[ind];

    lonlat = new OpenLayers.LonLat(st.lon, st.lat)
      .transform(
        g_projection, // transform from WGS 1984
        g_map.getProjectionObject() // to Spherical Mercator Projection
      );

    scale_factor = 1.0;
    stop_w = g_param.stop_w;
    stop_h = g_param.stop_h;

    if ((g_map.zoom <= 13) && (g_map.zoom >= 8)) {
      scale_factor = Math.exp(Math.log(2) * (g_map.zoom - 14));
      stop_w *= scale_factor;
      stop_h *= scale_factor;
    }

    size = new OpenLayers.Size(stop_w, stop_h);
    offset = new OpenLayers.Pixel(-(size.w / 2), -(size.h / 2));

    code = st.code;
    icon = new OpenLayers.Icon("img/metro_T_fade.png", size, offset);
    if (/r/.test(code)) {
      icon = new OpenLayers.Icon("img/metro_T_red_fade.png", size, offset);
    } else if (/o/.test(code)) {
      icon = new OpenLayers.Icon("img/metro_T_orange_fade.png", size, offset);
    } else if (/b/.test(code)) {
      icon = new OpenLayers.Icon("img/metro_T_blue_fade.png", size, offset);
    } else if (/g/.test(code)) {
      icon = new OpenLayers.Icon("img/metro_T_green_fade.png", size, offset);
    }

    stopMarker = new OpenLayers.Marker(lonlat, icon);

    if (g_stops[ind].hasOwnProperty("marker")) {
      g_stop_layer.removeMarker(g_stops[ind].marker);
    }
    g_stops[ind].marker = stopMarker;
    g_stop_layer.addMarker(stopMarker);
  }
}

function createPopUp(feature){
  var popup = new OpenLayers.Popup.FramedCloud("popup",
    OpenLayers.LonLat.fromString(feature.geometry.toShortString()),
    null,
    "<div style='font-size:.8em'>Line: " + feature.data.color + "<br>Route: " + feature.data.route + "<br>Next Stop: " + feature.data.predictionStop + "<br>Arriving In: " + feature.data.predictionTime + "</div>",
    null,
    true
    );
  return popup;
}

function destoryPopUp (feature) {
  g_map.removePopup(feature.popup);
  feature.popup.destroy();
  feature.popup = null;
  return;
}

function initMap() {
  g_map = new OpenLayers.Map("mapdiv");

  g_map_layer_switcher = new OpenLayers.Control.LayerSwitcher({
    'div': OpenLayers.Util.getElement('layerswitcher')
  });
  g_map.addControl(g_map_layer_switcher);

  g_map_layer_switcher.maximizeControl();

  g_map.events.register("zoomend", g_map, mapEvent);
  g_map.events.register("movestart", g_map, mapEvent);
  g_map.events.register("move", g_map, mapEvent);
  g_map.events.register("moveend", g_map, mapEvent);

  var transportattrib = 'Maps © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> <br/> Data © <a href="http://www.thunderforest.com">Thunderforest</a> ';

  var transport = new OpenLayers.Layer.OSM("Transport", ["http://a.tile.thunderforest.com/transport/${z}/${x}/${y}.png",
    "http://b.tile.thunderforest.com/transport/${z}/${x}/${y}.png",
    "http://c.tile.thunderforest.com/transport/${z}/${x}/${y}.png"
    ], {
    displayOutsideMaxExtent: true,
    transitionEffect: 'resize',
    attribution: transportattrib,
    displayInLayerSwitcher: false
  });

  g_map.addLayer(transport);

  g_marker_layer = new OpenLayers.Layer.Vector("Trains", {
    eventListeners: {
      'featureselected': function (evt) {
        var feature = evt.feature;
        var popup = createPopUp(feature);
        feature.popup = popup;
        g_map.addPopup(popup);
      },
      'featureunselected': function (evt) {
        var feature = evt.feature;
        destoryPopUp(feature);
      }
    }
  });

  g_marker_layer_buses = new OpenLayers.Layer.Vector("Buses", {
    eventListeners: {
      'featureselected': function (evt) {
        var feature = evt.feature;
         var popup = createPopUp(feature);
        feature.popup = popup;
        g_map.addPopup(popup);
      },
      'featureunselected': function (evt) {
        var feature = evt.feature;
        g_map.removePopup(feature.popup);
        destoryPopUp(feature);
      }
    }
  });

  g_marker_layer_buses.setVisibility(false);
  g_map.addLayer(g_marker_layer);
  g_map.addLayer(g_marker_layer_buses);

  var selector = new OpenLayers.Control.SelectFeature([g_marker_layer, g_marker_layer_buses],
    {
       clickout: true, toggle: false,
       multiple: false, hover: false,
       toggleKey: "ctrlKey", // ctrl key removes from selection
       multipleKey: "shiftKey", // shift key adds to selection
      autoActivate: true
   }
  );


  g_map.addControl(selector);

  g_stop_layer = new OpenLayers.Layer.Markers("Train Stops");

  drawStops(true);
  g_map.addLayer(g_stop_layer);
  g_map.setLayerIndex(g_stop_layer, 0);

    var geolocate = new OpenLayers.Control.Geolocate({
    bind: false,
    geolocationOptions: {
        enableHighAccuracy: false,
        maximumAge: 0,
        timeout: 7000
    }
  });

  g_map.addControl(geolocate);

  geolocate.events.register("locationupdated",geolocate,function(e) {
    lonLat = new OpenLayers.LonLat(e.position.coords.longitude, e.position.coords.latitude).transform(
        new OpenLayers.Projection("EPSG:4326"),
        g_map.getProjectionObject()
      );
    g_map.setCenter(lonLat, g_zoom);
  });

  geolocate.activate();

  var lat = 42.3583183;
  var lon = -71.0584536;
  var lonLat;

  lonLat = new OpenLayers.LonLat(lon, lat).transform(
        new OpenLayers.Projection("EPSG:4326"),
        g_map.getProjectionObject()
      );
  g_map.setCenter(lonLat, g_zoom);

}

$(document).ready(function () {
  OpenLayers.ImgPath = "img/";
  initMap();
  setupRTStreams();
});
