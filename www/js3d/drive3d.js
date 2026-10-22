/* drive3d.js — lightweight, forgiving truck controller (no physics engine needed).
   Bicycle-model steering, smooth acceleration that depends on the cargo weight, firm braking, reverse, slopes,
   road surfaces, a sprung body (pitch / roll / bounce) and soft road edges: the truck can scrape the verge
   but never flips, slides away or gets stuck. */
(function (CT) {
  'use strict';
  var B = window.BABYLON;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function approach(v, t, d) { return v < t ? Math.min(t, v + d) : Math.max(t, v - d); }

  function Drive(truck, road, cfg) {
    this.t = truck; this.road = road; this.cfg = cfg;
    var f = road.at(road.startS);
    this.s = road.startS;
    this.x = f.x + f.rx * CT.Road3D.LANE_R; this.z = f.z + f.rz * CT.Road3D.LANE_R; this.y = f.y;
    this.yaw = f.h;
    this.v = 0; this.steer = 0; this.throttle = 0; this.rev = 0; this.braking = false;
    this.lat = CT.Road3D.LANE_R;
    this.cargoWeight = 0;
    this.surface = null;
    this.noPower = false;
    this.locked = true;                  // parked (loading / delivering / scripted)
    this.pitch = 0; this.pitchV = 0; this.roll = 0; this.rollV = 0; this.bob = 0; this.bobV = 0;
    this.accel = 0; this.latAcc = 0; this.distance = 0;
    this.onImpact = null; this.onScrape = null;
    this.place();
  }

  Drive.prototype.place = function () {
    var r = this.t.root;
    r.position.set(this.x, this.y, this.z);
    r.rotation.set(0, this.yaw, 0);
    var b = this.t.body;
    b.rotation.x = this.pitch; b.rotation.z = this.roll; b.position.y = this.bob;
  };

  Drive.prototype.forward = function () { return new B.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); };
  Drive.prototype.kmh = function () { return this.v * 3.6; };

  /** input: { gas, brake, reverse, steer (-1 left .. 1 right) } */
  /** The truck drove off a drop: it tips over the edge and falls (scripted, then the game respawns it). */
  Drive.prototype.startFall = function (side, f) {
    if (this.falling) return;
    this.falling = { t: 0, side: side, vx: f.rx * side * Math.max(2, Math.abs(this.v) * 0.25), vz: f.rz * side * Math.max(2, Math.abs(this.v) * 0.25), vy: 0,
      fx: Math.sin(this.yaw) * this.v * 0.6, fz: Math.cos(this.yaw) * this.v * 0.6, roll: 0 };
    if (this.onFall) this.onFall(side);
  };
  Drive.prototype.updateFall = function (dt) {
    var F = this.falling; F.t += dt;
    F.vy -= 9.8 * dt;
    this.x += (F.vx + F.fx) * dt; this.z += (F.vz + F.fz) * dt; this.y += F.vy * dt;
    F.roll += dt * 1.6 * F.side;
    this.t.root.position.set(this.x, this.y, this.z);
    this.t.root.rotation.z = -F.roll;
    this.t.root.rotation.x += dt * 0.4;
    this.t.roll(this.v * dt, 0);
    return F.t;
  };
  /** Puts the truck back on the road (right lane, facing along it) at distance s. */
  Drive.prototype.respawn = function (s) {
    var f = this.road.at(s);
    this.falling = null; this.s = s;
    this.x = f.x + f.rx * CT.Road3D.LANE_R; this.z = f.z + f.rz * CT.Road3D.LANE_R; this.y = f.y;
    this.yaw = f.h; this.v = 0; this.steer = 0; this.throttle = 0; this.rev = 0;
    this.pitch = this.roll = this.bob = this.pitchV = this.rollV = this.bobV = 0;
    this.t.root.rotation.set(0, this.yaw, 0);
    this.place();
  };

  Drive.prototype.update = function (dt, input) {
    if (this.falling) { this.updateFall(dt); return 0; }
    var c = this.cfg, v0 = this.v, v = this.v, surf = this.surface || {};
    var lock = this.locked;
    var gas = !lock && !this.noPower && input.gas && !input.brake;
    var rev = !lock && !this.noPower && input.reverse && !input.brake && !input.gas;
    var brake = lock || input.brake;
    this.throttle = approach(this.throttle, gas ? 1 : 0, dt * 4);
    this.rev = approach(this.rev, rev ? 1 : 0, dt * 4);
    this.braking = brake && Math.abs(v) > 0.3;

    var grip = (c.grip || 1) * (surf.grip || 1);
    var mass = c.mass * (1 + this.cargoWeight * 0.05);              // a heavier load accelerates and stops slower
    var a = 0, decel = 0;
    if (this.throttle > 0.01) {
      if (v < -0.2) decel += c.brake * 0.8 * this.throttle;        // gas while rolling back = brake first
      else a += c.accel / mass * (0.55 + 0.45 * grip) * this.throttle * Math.max(0, 1 - Math.pow(Math.max(0, v) / c.top, 2));
    }
    if (this.rev > 0.01) {
      if (v > 0.2) decel += c.brake * 0.8 * this.rev;
      else a -= c.accel * 0.7 / mass * this.rev * Math.max(0, 1 - Math.pow(Math.max(0, -v) / c.revTop, 2));
    }
    if (brake) decel += c.brake * (0.35 + 0.65 * grip) / (1 + this.cargoWeight * 0.025);
    decel += 0.18 + 0.0018 * v * v + (surf.drag || 0);
    if (surf.cap && Math.abs(v) > surf.cap) decel += (Math.abs(v) - surf.cap) * 1.5;
    var slope = this.road.at(this.s).slope;
    a -= 9.8 * Math.sin(slope) * 0.55 * (this.throttle > 0.1 ? 1 / c.hill : 1);   // hills slow the truck (engine level helps)
    v += a * dt;
    var dv = decel * dt;
    if (v > 0) v = Math.max(0, v - dv); else if (v < 0) v = Math.min(0, v + dv);
    if (lock && Math.abs(v) < 0.05) v = 0;

    // steering: limited at speed so the truck stays stable; returns to straight when released
    var sMax = c.steerMax / (1 + Math.abs(v) * 0.045);
    var target = lock ? 0 : clamp(input.steer || 0, -1, 1) * sMax;
    var rate = (Math.abs(target) > Math.abs(this.steer) ? 1.6 : 2.6) * (surf.grip ? 0.5 + 0.5 * surf.grip : 1);
    this.steer = approach(this.steer, target, rate * dt);
    var yawRate = v * Math.tan(this.steer) / c.wheelbase;
    var maxLat = 6.5 * grip;                                        // understeer instead of sliding sideways
    if (Math.abs(v * yawRate) > maxLat) yawRate = Math.sign(yawRate) * maxLat / Math.max(1, Math.abs(v));
    this.yaw += yawRate * dt;
    this.latAcc = v * yawRate;

    var dx = Math.sin(this.yaw) * v * dt, dz = Math.cos(this.yaw) * v * dt;
    this.x += dx; this.z += dz;

    // keep the truck on the road strip (soft edges)
    var pr = this.road.project(this.x, this.z, this.s), f = pr.f;
    this.s = pr.s; this.lat = pr.lat;
    var edge = CT.Road3D.HALF + 1.4 - this.t.width / 2;
    var cliff = this.road.cliffAt(this.s);
    if (cliff && !cliff.rail && Math.sign(pr.lat) === cliff.side && Math.abs(pr.lat) > CT.Road3D.HALF - 0.1) {   // the outer wheels are over the edge
      this.startFall(cliff.side, f);                // over the edge: nothing to stop the truck
      this.v = v; this.place(); return 0;
    }
    if (Math.abs(pr.lat) > edge) {
      var push = Math.abs(pr.lat) - edge, sg = Math.sign(pr.lat);
      this.x -= f.rx * sg * push; this.z -= f.rz * sg * push;
      var into = Math.sin(this.yaw - f.h) * sg;                     // heading towards the edge?
      if (into > 0) this.yaw -= sg * Math.min(into, 0.6) * dt * 3;  // guide the nose back along the road
      if (Math.abs(v) > 3 && this.onScrape) this.onScrape(Math.abs(v), sg);
      v *= 1 - Math.min(0.5, dt * 1.2);
    }
    // road ends: a soft barrier, never a dead end
    var endS = this.road.length - this.t.halfLen - 1, startS = this.t.halfLen + 1;
    if (this.s > endS && Math.cos(this.yaw - f.h) * v > 0) { if (this.onImpact && v > 2) this.onImpact(Math.abs(v), 1); v = -v * 0.15; var fe = this.road.at(endS); this.x = fe.x + fe.rx * pr.lat; this.z = fe.z + fe.rz * pr.lat; }
    if (this.s < startS && Math.cos(this.yaw - f.h) * v < 0) { if (this.onImpact && v < -2) this.onImpact(Math.abs(v), -1); v = -v * 0.15; var fs = this.road.at(startS); this.x = fs.x + fs.rx * pr.lat; this.z = fs.z + fs.rz * pr.lat; }

    this.v = v;
    var moved = Math.sqrt(dx * dx + dz * dz);
    this.distance += moved;
    this.y = f.y;
    var acc = dt > 0 ? (v - v0) / dt : 0;
    this.accel += (acc - this.accel) * Math.min(1, dt * 8);

    // sprung body
    var tp = clamp(-this.accel * 0.006, -0.05, 0.05), tr = clamp(-this.latAcc * 0.012, -0.06, 0.06);
    this.pitchV += ((tp - this.pitch) * 90 - this.pitchV * 9) * dt; this.pitch += this.pitchV * dt;
    this.rollV += ((tr - this.roll) * 90 - this.rollV * 9) * dt; this.roll += this.rollV * dt;
    var soft = 1 - Math.min(0.5, c.suspension * 0.08);
    var rough = surf.rough ? Math.sin(this.distance * 6.3) * 0.02 * Math.min(1, Math.abs(v) / 12) : 0;
    this.bobV += ((rough - this.bob) * 160 - this.bobV * 10) * dt; this.bob += this.bobV * dt * soft;
    this.place();
    this.root_pitchSlope();
    this.t.roll(v * dt, this.steer * 1.4);
    this.t.setBrake(this.braking || (this.rev > 0.1));
    return moved;
  };

  /** Tilts the whole truck with the road slope. */
  Drive.prototype.root_pitchSlope = function () {
    var f = this.road.at(this.s);
    this.t.root.rotation.x = -f.slope * Math.cos(this.yaw - f.h);
  };

  /** A sudden vertical kick (speed bump, pothole). */
  Drive.prototype.kick = function (amount) {
    this.bobV += amount;
    this.pitchV -= amount * 0.4;
  };

  /** Moves the truck along the road to s, keeping its lane and heading relative to the road. */
  Drive.prototype.pushTo = function (s) {
    var f0 = this.road.at(this.s), f = this.road.at(s), rel = this.yaw - f0.h;
    this.s = s; this.x = f.x + f.rx * this.lat; this.z = f.z + f.rz * this.lat; this.y = f.y; this.yaw = f.h + rel;
    this.place();
  };
  Drive.prototype.stop = function () { this.v = 0; this.throttle = 0; this.rev = 0; };

  CT.Drive3D = Drive;
})(window.CT);
