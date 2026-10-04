// 1) 방문자의 운영체제에 맞는 다운로드를 "추천"으로 표시한다.
// 2) GitHub에서 최신 릴리스를 확인해 다운로드 링크를 최신 버전으로 바꾼다(실패하면 페이지에 적힌 링크를 그대로 쓴다).
(function () {
  var ua = navigator.userAgent;
  var hint = document.getElementById('os-hint');
  var os = /Windows/i.test(ua) ? 'windows'
    : /iPhone|iPad|Android/i.test(ua) ? 'mobile'
    : /Mac OS X|Macintosh/i.test(ua) ? 'mac'
    : /CrOS/i.test(ua) ? 'chrome' : '';

  if (os === 'mobile') {
    hint.textContent = '휴대폰·태블릿에서는 설치할 수 없습니다. 녹화는 PC(Windows·Mac)에서 해 주세요. 학생 실습은 태블릿에서도 됩니다.';
    hint.hidden = false;
  } else if (os) {
    document.querySelectorAll('.dl[data-os="' + os + '"]').forEach(function (el) { el.classList.add('recommended'); });
    if (os === 'mac') {
      hint.textContent = 'Mac에서 접속하셨네요. 칩 종류(Apple Silicon / Intel)에 맞는 파일을 받으세요.';
      hint.hidden = false;
    }
  }

  var api = 'https://api.github.com/repos/janghwansangai/claude_work/releases/latest';
  if (!window.fetch) return;
  fetch(api, { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rel) {
      if (!rel || !rel.assets) return;
      var set = function (id, re) {
        var a = rel.assets.find(function (x) { return re.test(x.name); });
        var el = document.getElementById(id);
        if (!a || !el) return;
        el.href = a.browser_download_url;
        var size = el.querySelector('.size');
        if (size) size.textContent = Math.round(a.size / 1e6) + 'MB';
      };
      set('dl-win', /Windows-Setup-.*\.exe$/);
      set('dl-mac-arm', /Mac-arm64-.*\.dmg$/);
      set('dl-mac-x64', /Mac-x64-.*\.dmg$/);
      var exe = rel.assets.find(function (x) { return /Windows-Setup-(.+)\.exe$/.test(x.name); });
      var m = exe && exe.name.match(/Windows-Setup-(.+)\.exe$/);
      if (m) document.getElementById('ver-label').textContent = '최신 버전 ' + m[1];
    })
    .catch(function () { /* 오프라인·요청 제한: 기본 링크 사용 */ });
})();
