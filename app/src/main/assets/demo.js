/* Cain OS · browser stand-in for the device.
   On the TV, the Android app provides window.CainNative and this file does nothing.
   Opened in an ordinary browser (to look at the design, or for automated tests), it answers the
   same calls with an empty device: no apps, no provider, nothing playing. Tests can fill it in by
   setting window.CAIN_MOCK before this file loads. */
(function(){
  'use strict';
  if (window.CainNative) return;
  var X = window.CAIN_MOCK || {};
  var later = function(name, data, ms){ setTimeout(function(){ if (window.CainOS) CainOS.emit(name, data); }, ms || 30); };
  var J = function(v){ return JSON.stringify(v); };
  var prefs = {};
  var link = { on:false, ip:'', port:0, code:'', paired:0 };
  var iptvFiles = {};

  window.CainDemo = {
    info: function(){ return J(Object.assign({ version:'1.0', model:'', maker:'', android:'', sdk:0, fireos:false, lowRam:false, voice:false, files:'' }, X.info || {})); },
    net: function(){ return J(Object.assign({ online:navigator.onLine, type:'', ip:'' }, X.net || {})); },
    storage: function(){ return J(X.storage || {}); },
    setPref: function(k, v){ prefs[k] = v; },
    getPref: function(k){ return prefs[k] == null ? null : prefs[k]; },
    typing: function(){}, keepAwake: function(){}, reload: function(){ location.reload(); },

    loadApps: function(){ later('apps', X.apps || []); },
    launch: function(pkg){ if (X.onLaunch) X.onLaunch(pkg); return !!(X.apps || []).some(function(a){ return a.pkg === pkg; }); },
    appInfo: function(){ return false; },
    openStore: function(){ return false; },
    openSettings: function(kind){ if (X.onSettings) X.onSettings(kind); return X.apps ? 'exact' : 'none'; },
    inputs: function(){ return J(X.inputs || []); },
    openInput: function(){ return false; },
    voice: function(){ if (!X.voiceText) return false; later('voice', X.voiceText, 200); return true; },

    iptvSync: function(cfg){
      var c = JSON.parse(cfg), P = X.provider;
      later('iptvProgress', { msg:'Signing in…', pct:5 }, 20);
      if (!P || (c.type === 'xtream' && (c.user !== P.user || c.pass !== P.pass))) {
        later('iptvDone', { ok:false, error: P ? 'The provider says the username or password is wrong.' : 'Connecting to a provider only works on the TV.', live:0, vod:0, series:0 }, 120);
        return;
      }
      iptvFiles = P.files;
      later('iptvProgress', { msg:'Loading movies…', pct:60 }, 60);
      var m = JSON.parse(P.files['meta.json']);
      later('iptvDone', { ok:true, error:'', live:m.live, vod:m.vod, series:m.series }, 140);
    },
    iptvRead: function(name){ return iptvFiles[name] || (X.provider && X.preloaded ? (X.provider.files[name] || '') : ''); },
    iptvSearch: function(id, q){
      var P = X.provider, out = { live:[], vod:[], series:[] }; q = String(q || '').toLowerCase();
      if (P) ['live','vod','series'].forEach(function(k){
        Object.keys(P.files).forEach(function(f){
          if (f.indexOf(k + '_') !== 0 || f.indexOf('cats') >= 0 || f.indexOf('.json') < 0) return;
          JSON.parse(P.files[f]).forEach(function(it){ if (out[k].length < 30 && it[1].toLowerCase().indexOf(q) >= 0) out[k].push(it.concat([f.replace(/\D/g,'')])); });
        });
      });
      later('iptvSearch', { id:id, r:out });
    },
    iptvClear: function(){ iptvFiles = {}; if (X.provider) X.preloaded = false; },
    http: function(id, url){ var r = X.http ? X.http(url) : null; later('http', { id:id, code: r ? 200 : -1, body: r ? J(r) : '' }, 60); },
    play: function(p){ if (X.onPlay) X.onPlay(JSON.parse(p)); var r = X.playResult ? X.playResult(JSON.parse(p)) : null; later('player', r, 80); },

    mediaAccess: function(){ return !!X.media; },
    media: function(){ return X.media ? J(X.media) : 'null'; },
    mediaCmd: function(c){ if (X.onMedia) X.onMedia(c); },
    musicList: function(){ return J(X.music || []); },
    musicScan: function(){ later('deviceMusic', X.deviceMusic || []); },
    musicClear: function(){ X.music = []; },
    userMedia: function(){ return J(X.userMedia || { wall:{}, photo:{} }); },
    deleteUserMedia: function(){},

    linkStart: function(){ if (X.linkIp) link = { on:true, ip:X.linkIp, port:8765, code:'482913', paired:0 }; return J(link); },
    linkStop: function(){ link = { on:false, ip:'', port:0, code:'', paired:0 }; },
    linkInfo: function(){ return J(link); },
    linkForget: function(){ link.paired = 0; },
    linkState: function(s){ window.CAIN_LINK_STATE = s; },

    homeStatus: function(){ return J({ service:false, redirect:true }); },
    openStockHome: function(){ return false; },
    installFromUrl: function(){ later('install', { state:'error', pct:0, msg:'Apps install on the TV.' }); },
    canInstall: function(){ return false; }
  };
})();
