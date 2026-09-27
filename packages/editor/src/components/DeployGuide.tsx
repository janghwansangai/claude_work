// ZIP 내보내기 화면의 "학생에게 나눠 주는 방법" 안내. 자세한 내용은 저장소 docs/zip-guide.md, ZIP 안 README.txt와 같다.
export function DeployGuide({ open }: { open: boolean }) {
  return (
    <details open={open} className="border rounded-lg bg-gray-50 text-sm text-gray-700">
      <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-gray-800">📘 받은 ZIP으로 학생에게 나눠 주는 방법</summary>
      <div className="px-4 pb-4 flex flex-col gap-3 leading-relaxed">
        <p className="bg-amber-50 border border-amber-200 text-amber-900 rounded px-3 py-2">
          ZIP이나 그 안의 index.html을 <b>더블클릭하면 동작하지 않습니다.</b> 아래처럼 웹 주소로 올려서 여세요.
        </p>
        <div>
          <h4 className="font-semibold text-gray-800">1. Cloudflare Pages에 올리기 (무료·추천)</h4>
          <ol className="list-decimal pl-5 space-y-0.5">
            <li><a className="text-blue-700 underline" href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer">dash.cloudflare.com</a> 가입·로그인 (신용카드 불필요)</li>
            <li><b>Workers &amp; Pages → Create → Pages → Upload assets</b> (Git 연결이 아니라 Upload)</li>
            <li>프로젝트 이름 입력 (예: <code>walksim-mail</code> → 주소 <code>walksim-mail.pages.dev</code>). 학교·학생 이름은 넣지 마세요.</li>
            <li><b>ZIP 파일을 그대로 끌어다 놓기 → Deploy</b>. 1분 안에 주소가 생깁니다.</li>
          </ol>
        </div>
        <div>
          <h4 className="font-semibold text-gray-800">2. 학생에게 주소 알려 주기</h4>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>칠판·클래스룸에 주소를 올리거나 QR 코드를 띄웁니다 (크롬 주소창 공유 아이콘 → QR 코드 만들기).</li>
            <li>학생은 <b>안내 / 연습 / 평가</b> 모드를 골라 실습합니다. 주소 끝에 <code>?mode=guide</code>처럼 붙이면 그 모드로 바로 시작합니다.</li>
            <li>결과(오답·도움 횟수)는 학생 화면에만 보이고 저장·전송되지 않습니다.</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-gray-800">3. 고쳤을 때</h4>
          <p>다시 ZIP 내보내기 → Cloudflare의 같은 프로젝트에서 <b>Create deployment</b> → 새 ZIP 올리기. 학생 주소는 그대로입니다. 실습이 여러 개면 프로젝트를 실습마다 따로 만드세요.</p>
        </div>
        <div>
          <h4 className="font-semibold text-gray-800">4. 수업 전날 확인</h4>
          <p>시크릿 창으로 끝까지 해 보고, 학생이 쓸 실제 기기와 학교 와이파이에서도 열어 보세요.</p>
        </div>
        <p className="text-xs text-gray-500">
          공개 주소는 링크만 알면 누구나 볼 수 있습니다. 가상 자료만 올리세요. 내 PC에서만 확인하는 방법 등 자세한 안내는 ZIP 안의 <b>README.txt</b>에 있습니다.
        </p>
      </div>
    </details>
  );
}
