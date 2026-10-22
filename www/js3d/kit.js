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
    var m;
    if (opt.unlit) {
      m = new B.StandardMaterial('m' + key, this.scene);
      m.disableLighting = true; m.emissiveColor = B.Color3.FromHexString(hex);
    } else {
      // physically based so every part reacts to the sky light like the trucks do
      m = new B.PBRMaterial('m' + key, this.scene);
      m.albedoColor = B.Color3.FromHexString(hex).toLinearSpace();
      m.metallic = opt.spec >= 0.4 ? 0.7 : 0;
      m.roughness = opt.spec >= 0.4 ? 0.3 : 0.75;
      if (opt.emissive) m.emissiveColor = B.Color3.FromHexString(opt.emissive);
      m.environmentIntensity = 0.8;
    }
    if (opt.alpha && opt.alpha < 1) { m.alpha = opt.alpha; if (m.transparencyMode !== undefined) m.transparencyMode = 2; }
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
    var m = new B.PBRMaterial(name, this.scene);
    m.albedoTexture = texture;
    m.metallic = 0; m.roughness = opt && opt.rough != null ? opt.rough : 0.8;
    m.environmentIntensity = 0.7;
    if (opt && opt.emissive) { m.emissiveTexture = texture; m.emissiveColor = B.Color3.FromHexString(opt.emissive); }
    if (opt && opt.alpha) { m.useAlphaFromAlbedoTexture = true; texture.hasAlpha = true; }
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

  // ------------------------------------------------------------------ realistic (PBR) materials
  var ASSET = 'assets/';
  /** Physically based material: colour, metallic, roughness, optional clear coat (car paint) and alpha (glass). */
  Kit.prototype.pbr = function (hex, opt) {
    opt = opt || {};
    var key = 'p|' + hex + '|' + JSON.stringify(opt);
    if (this.mats[key]) return this.mats[key];
    var m = new B.PBRMaterial('p' + key, this.scene);
    m.albedoColor = B.Color3.FromHexString(hex).toLinearSpace();
    m.metallic = opt.metal != null ? opt.metal : 0;
    m.roughness = opt.rough != null ? opt.rough : 0.6;
    if (opt.coat) { m.clearCoat.isEnabled = true; m.clearCoat.intensity = opt.coat; m.clearCoat.roughness = 0.08; }
    if (opt.alpha != null && opt.alpha < 1) { m.alpha = opt.alpha; m.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHABLEND; }
    if (opt.emissive) { m.emissiveColor = B.Color3.FromHexString(opt.emissive); m.emissiveIntensity = opt.glow || 1; }
    m.environmentIntensity = opt.env != null ? opt.env : 1;
    if (!opt.live) m.freeze();
    this.mats[key] = m;
    return m;
  };
  /** Cached photo texture from assets/tex (CC0, Poly Haven). */
  Kit.prototype.photo = function (name, uScale, vScale) {
    var key = 'ph|' + name + '|' + uScale + '|' + vScale;
    if (this.mats[key]) return this.mats[key];
    var t = new B.Texture(ASSET + 'tex/' + name + '.jpg', this.scene, false, true, B.Texture.TRILINEAR_SAMPLINGMODE);
    t.uScale = uScale || 1; t.vScale = vScale || uScale || 1;
    t.anisotropicFilteringLevel = this.lowFx ? 1 : 4;
    this.mats[key] = t;
    return t;
  };
  /** Photo-textured PBR surface (albedo + normal + roughness maps). */
  Kit.prototype.surface = function (name, scale, opt) {
    opt = opt || {};
    var key = 's|' + name + '|' + scale + '|' + JSON.stringify(opt);
    if (this.mats[key]) return this.mats[key];
    var m = new B.PBRMaterial('s' + key, this.scene);
    m.albedoTexture = this.photo(name + '_diff', scale, opt.v || scale);
    if (opt.tint) m.albedoColor = B.Color3.FromHexString(opt.tint);
    if (!this.lowFx) {
      m.bumpTexture = this.photo(name + '_nor_gl', scale, opt.v || scale);
      m.bumpTexture.level = opt.bump || 1;
      m.invertNormalMapY = false;
      m.metallicTexture = this.photo(name + '_rough', scale, opt.v || scale);
      m.useRoughnessFromMetallicTextureGreen = true; m.useMetallnessFromMetallicTextureBlue = false; m.useAmbientOcclusionFromMetallicTextureRed = false;
    }
    m.metallic = opt.metal || 0; m.roughness = opt.rough != null ? opt.rough : 1;
    m.environmentIntensity = opt.env != null ? opt.env : 0.6;
    if (opt.back) m.backFaceCulling = false;
    this.mats[key] = m;
    return m;
  };
  /** Real sky photo + image-based lighting + filmic tone mapping. sky: 'day' | 'clear' | 'overcast' */
  Kit.prototype.environment = function (sky, opt) {
    opt = opt || {};
    var sc = this.scene;
    try {
      var env = new B.HDRCubeTexture(ASSET + 'hdri/' + sky + '_env.hdr', sc, 128, false, true, false, true);
      sc.environmentTexture = env;
      sc.environmentIntensity = opt.envIntensity || 1;
    } catch (e) { console.warn('env', e); }
    if (!opt.noSky) {
      var dome = new B.PhotoDome('sky', ASSET + 'hdri/' + sky + '_sky.jpg', { resolution: 24, size: 1600, useDirectMipMapping: false }, sc);
      dome.mesh.applyFog = false; dome.mesh.isPickable = false; dome.mesh.infiniteDistance = true;
      dome.imageMode = B.PhotoDome.MODE_MONOSCOPIC;
      if (dome.material) dome.material.backFaceCulling = false;
      this.dome = dome;
    }
    var ip = sc.imageProcessingConfiguration;
    ip.toneMappingEnabled = true; ip.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = opt.exposure || 1.05; ip.contrast = 1.15;
    if (!this.lowFx && !opt.noPipeline) {
      var cam = opt.camera;
      if (cam) {
        var pipe = new B.DefaultRenderingPipeline('pipe', false, sc, [cam]);
        pipe.fxaaEnabled = true; pipe.samples = 1;
        pipe.imageProcessingEnabled = false;      // the scene's own image processing (above) stays in charge
        pipe.bloomEnabled = !!opt.bloom; if (opt.bloom) { pipe.bloomThreshold = 0.85; pipe.bloomWeight = 0.25; pipe.bloomKernel = 32; pipe.bloomScale = 0.5; }
        this.pipeline = pipe;
      }
    }
  };

  /** Extrudes a closed 2D outline (x = length along the truck, y = height) across the width, with softened ends. */
  Kit.prototype.profile = function (name, pts, width, mat, parent, opt) {
    opt = opt || {};
    var shape = pts.map(function (p) { return new B.Vector3(-p[0], p[1], 0); });   // outline x = truck length (+z)
    shape.push(shape[0].clone());
    var half = width / 2, bev = opt.bevel != null ? opt.bevel : 0.06;
    var path = [new B.Vector3(-half, 0, 0), new B.Vector3(-half + bev, 0, 0), new B.Vector3(half - bev, 0, 0), new B.Vector3(half, 0, 0)];
    var sc = [1 - bev * 0.9, 1, 1, 1 - bev * 0.9];
    var m = B.MeshBuilder.ExtrudeShapeCustom(name, {
      shape: shape, path: path, cap: B.Mesh.CAP_ALL, sideOrientation: B.Mesh.DOUBLESIDE,
      scaleFunction: function (i) { return sc[i]; }, rotationFunction: function () { return 0; }
    }, this.scene);
    m.material = mat;
    if (parent) m.parent = parent;
    m.convertToFlatShadedMesh && opt.flat && m.convertToFlatShadedMesh();
    return m;
  };

  Kit.prototype.shadow = function (mesh) {
    if (this.shadowGen && mesh) this.shadowGen.addShadowCaster(mesh, true);
  };

  CT.Kit = Kit;
  CT.V3 = V3;
})(window.CT);
