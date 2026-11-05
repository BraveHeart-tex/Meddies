// Loads the Meddies component namespace for cards and UI kits.
// 1) uses the compiled bundle if present; 2) otherwise transpiles component .jsx sources in-browser (needs Babel).
(function () {
  var GROUPS = {
    core: ['Icon', 'Button', 'IconButton', 'StatusBadge', 'Card'],
    forms: ['OutcomeChoice', 'ChipGroup', 'Stepper', 'TextField', 'Switch'],
    medication: ['PillTile', 'NextDoseCard', 'DoseCard', 'MedicationRow'],
    navigation: ['AppHeader', 'BottomNav'],
    overlays: ['Sheet', 'Toast']
  };
  var ALL = [].concat.apply([], Object.keys(GROUPS).map(function (k) { return GROUPS[k]; }));

  function findNS() {
    var keys = Object.keys(window);
    for (var i = 0; i < keys.length; i++) {
      try {
        var v = window[keys[i]];
        if (!v || typeof v !== 'object' || v === window || Array.isArray(v)) continue;
        if (v.window === v) continue;
        if (typeof v.Button === 'function' && typeof v.StatusBadge === 'function') return v;
      } catch (e) { continue; }
    }
    return null;
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  function transpile(src, name, scope) {
    var body = src.replace(/^\s*import[^;]*;?\s*$/mg, '').replace(/export\s+(function|const|class)/g, '$1');
    var code = Babel.transform(body, { presets: ['react'] }).code;
    var names = Object.keys(scope).filter(function (n) { return n !== name && /^[A-Za-z_$][\w$]*$/.test(n); });
    var pre = names.length ? 'var ' + names.map(function (n) { return n + ' = __S.' + n; }).join(', ') + ';\n' : '';
    return new Function('React', '__S', pre + code + '\nreturn ' + name + ';')(React, scope);
  }
  async function loadFiles(paths, scope) {
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      var name = p.split('/').pop().replace(/\.jsx$/, '');
      var src = await (await fetch(p)).text();
      scope[name] = transpile(src, name, scope);
    }
    return scope;
  }
  async function load(root) {
    root = root || '';
    var ns = findNS();
    if (!ns) {
      try {
        var head = await fetch(root + '_ds_bundle.js', { method: 'HEAD' });
        if (head.ok) { await loadScript(root + '_ds_bundle.js'); ns = findNS(); }
      } catch (e) {}
    }
    if (ns && ALL.every(function (n) { return typeof ns[n] === 'function'; })) return Object.assign({}, ns);
    var scope = {};
    var paths = [];
    Object.keys(GROUPS).forEach(function (g) { GROUPS[g].forEach(function (n) { paths.push(root + 'components/' + g + '/' + n + '.jsx'); }); });
    return loadFiles(paths, scope);
  }
  window.MeddiesDS = { load: load, loadFiles: loadFiles, groups: GROUPS };
})();
