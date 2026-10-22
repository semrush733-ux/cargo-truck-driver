/* kit.js — small helpers for the 3D mode: cached flat materials, primitive builders and procedural textures.
   Everything is generated in code (no external model or texture files), so nothing can go missing offline. */
(function (CT) {
  'use strict';
  var B = window.BABYLON;
  var V3 = B.Vector3;

  function Kit(scene) {
    this.scene = scene;
    this.mats = {};
    this.lowFx = !!CT.Storage.getSetting('lowFx');
  }

  /** Flat-coloured material, cached per colour + options. */
  Kit.prototype.mat = function (hex, opt) {
    opt = opt || {};
    var key = hex + '|' + (opt.emissive || '') + '|' + (opt.alpha || 1) + '|' + (opt.spec || 0) + '|' + (opt.unlit ? 1 : 0);
    if (this.mats[key]) return this.mats[key];
    var m = new B.StandardMaterial('m' + key, this.scene);
    m.diffuseColor = B.Color3.FromHexString(hex);
    m.specularColor = new B.Color3(opt.spec || 0.06, opt.spec || 0.06, opt.spec || 0.06);
    if (opt.spec) m.specularPower = 48;
    if (opt.emissive) m.emissiveColor = B.Color3.FromHexString(opt.emissive);
    if (opt.unlit) { m.disableLighting = true; m.emissiveColor = B.Color3.FromHexString(hex); }
    if (opt.alpha && opt.alpha < 1) m.alpha = opt.alpha;
    m.freeze();
    this.mats[key] = m;
    return m;
  };

  /** Box: size {w,h,d}, position of its centre, parent, material colour. */
  Kit.prototype.box = function (name, w, h, d, x, y, z, parent, hex, opt) {
    var b = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
    b.position.set(x, y, z);
    if (parent) b.parent = parent;
    if (hex) b.material = this.mat(hex, opt);
    return b;
  };
  Kit.prototype.cyl = function (name, dia, h, x, y, z, parent, hex, opt, tess) {
    var c = B.MeshBuilder.CreateCylinder(name, { diameter: dia, height: h, tessellation: tess || 14 }, this.scene);
    c.position.set(x, y, z);
    if (parent) c.parent = parent;
    if (hex) c.material = this.mat(hex, opt);
    return c;
  };
  Kit.prototype.node = function (name, parent, x, y, z) {
    var n = new B.TransformNode(name, this.scene);
    if (parent) n.parent = parent;
    n.position.set(x || 0, y || 0, z || 0);
    return n;
  };

  /** Canvas-drawn texture. draw(ctx, w, h) */
  Kit.prototype.tex = function (name, w, h, draw, opt) {
    var t = new B.DynamicTexture(name, { width: w, height: h }, this.scene, !!(opt && opt.mip), B.Texture.TRILINEAR_SAMPLINGMODE);
    var ctx = t.getContext();
    draw(ctx, w, h);
    t.update(false);
    t.hasAlpha = !!(opt && opt.alpha);
    t.wrapU = t.wrapV = B.Texture.WRAP_ADDRESSMODE;
    return t;
  };
  Kit.prototype.texMat = function (name, texture, opt) {
    var m = new B.StandardMaterial(name, this.scene);
    m.diffuseTexture = texture;
    m.specularColor = new B.Color3(0.04, 0.04, 0.04);
    if (opt && opt.emissive) m.emissiveColor = B.Color3.FromHexString(opt.emissive);
    if (opt && opt.alpha) { m.useAlphaFromDiffuseTexture = true; texture.hasAlpha = true; }
    if (opt && opt.back) m.backFaceCulling = false;
    return m;
  };

  /** Soft round particle texture (smoke / dust / rain / sparks). */
  Kit.prototype.dotTex = function () {
    if (this._dot) return this._dot;
    this._dot = this.tex('dot', 64, 64, function (ctx) {
      var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.clearRect(0, 0, 64, 64); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    }, { alpha: true });
    return this._dot;
  };

  /** Text sign as a plane (both sides readable when back=true). */
  Kit.prototype.sign = function (name, text, w, h, bg, fg, parent, opt) {
    var cw = 512, ch = Math.round(512 * h / w);
    var t = this.tex(name + 'T', cw, ch, function (ctx) {
      ctx.translate(0, ch); ctx.scale(1, -1);          // DynamicTexture is stored upside down: draw flipped so text reads correctly
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = fg; ctx.lineWidth = Math.max(6, ch * 0.05); ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, cw - ctx.lineWidth, ch - ctx.lineWidth);
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var size = Math.min(ch * 0.62, cw / (text.length * 0.62));
      ctx.font = '900 ' + Math.round(size) + 'px "Arial Black", Arial, sans-serif';
      ctx.fillText(text, cw / 2, ch / 2 + size * 0.05);
    });
    var p = B.MeshBuilder.CreatePlane(name, { width: w, height: h, sideOrientation: (opt && opt.back) ? B.Mesh.DOUBLESIDE : B.Mesh.FRONTSIDE }, this.scene);
    var m = this.texMat(name + 'M', t, { emissive: opt && opt.glow ? opt.glow : '#555555' });
    p.material = m;
    if (parent) p.parent = parent;
    return p;
  };

  Kit.prototype.shadow = function (mesh) {
    if (this.shadowGen && mesh) this.shadowGen.addShadowCaster(mesh, true);
  };

  CT.Kit = Kit;
  CT.V3 = V3;
})(window.CT);
