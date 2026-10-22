import { useEffect, useState } from 'preact/hooks';
import type { Lang } from '../../src/shared/types.js';
import { isLang } from '../../src/shared/types.js';

/**
 * UI strings in every language, no i18n library. `en` is the source of truth;
 * `he` must have exactly the same keys (the `typeof en` annotation enforces
 * it). Strings that depend on names/amounts/counts are functions.
 *
 * `tr` is an ESM live binding — `import { tr } from './i18n.js'` always reads
 * the current language. Components re-render on a language change because
 * `App` (and `InstallGate`) call `useLang()`, and everything else is beneath them.
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const en = {
  appName: 'Poker Night',
  common: {
    cancel: 'Cancel',
    saving: 'Saving…',
    loading: 'Loading…',
    you: 'You',
    youSuffix: ' · you',
    youParen: ' (you)',
    host: 'Host',
    live: 'Live',
    back: 'Back',
    backToTables: 'Back to tables',
    players: (n: number) => plural(n, 'player', 'players'),
    networkError: 'Could not reach the server.',
  },
  install: {
    body: 'This only runs as an installed app — add it to your home screen to open it.',
    installing: 'Installing…',
    install: 'Install App',
    iosStep1Before: 'Tap the',
    share: 'Share',
    iosStep1After: "button in Safari's toolbar",
    iosStep2Before: 'Scroll down and tap',
    addToHome: 'Add to Home Screen',
    iosStep3Tap: 'Tap',
    add: 'Add',
    iosStep3Open: ', then open',
    iosStep3After: 'from your home screen',
    otherBrowsers:
      'Open this page on your phone in Chrome or Safari, then use the browser menu to "Add to Home Screen" / "Install app." (Desktop browsers that don\'t support installing a PWA can\'t open this app.)',
  },
  app: {
    opening: 'Opening Poker Night…',
    backToTable: 'Back to table',
    settings: 'Settings',
    oneMoreThing: 'One more thing',
    addPhoneSub: 'Add your phone number so friends can pay you after a game.',
    continue: 'Continue',
    loadingGame: 'Loading game…',
    tabs: { tables: 'Tables', leaderboard: 'Leaderboard', games: 'Games', payments: 'Payments' },
  },
  login: {
    tagline: 'Buy-ins, cash-outs and who pays whom — sorted for your home game.',
    logIn: 'Log in',
    signUp: 'Sign up',
    username: 'Username',
    usernamePlaceholderNew: 'What friends call you',
    usernamePlaceholder: 'yourname',
    password: 'Password',
    passwordPlaceholderNew: 'At least 6 characters',
    phone: 'Phone number',
    phoneWhy: '· friends pay you with it',
    loggingIn: 'Logging in…',
    creating: 'Creating account…',
    create: 'Create account',
  },
  phone: {
    label: 'Phone number',
  },
  settings: {
    title: 'Settings',
    noPhone: 'No phone number',
    account: 'Account',
    name: 'Name',
    change: 'Change',
    newName: 'New name',
    currentPassword: 'Current password',
    confirmItsYou: "To confirm it's you",
    saveName: 'Save name',
    nameUpdated: 'Name updated.',
    phoneLabel: 'Phone · friends pay you with it',
    notSet: 'Not set',
    saveNumber: 'Save number',
    phoneUpdated: 'Phone number updated.',
    language: 'Language',
    logOut: 'Log out',
    logOutTitle: 'Log out?',
    logOutBody: "You'll need your username and password to log back in.",
    addPhoto: 'Add photo',
    changePhoto: 'Change photo',
    removePhoto: 'Remove',
    uploadingPhoto: 'Uploading…',
    photoUpdated: 'Photo updated.',
    photoRemoved: 'Photo removed.',
    photoUnreadable: "That photo couldn't be opened — try another one.",
  },
  tables: {
    title: 'Tables',
    sub: "Start tonight's game or jump back in.",
    newGame: 'New game',
    heroSub: "You'll be the host — friends see it here and tap to join.",
    starting: 'Starting…',
    start: 'Start a table',
    happeningNow: 'Happening now',
    noTables: 'No tables right now',
    noTablesSub: 'Start one above — everyone with the app will see it.',
    inLobby: 'In the lobby',
    onTheTable: 'On the table',
    join: 'Join',
  },
  sessionName: {
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    night: 'Night',
    format: (day: string, time: string) => `${day} ${time}`,
  },
  lobby: {
    lobby: 'Lobby',
    hostHint: 'Start the game once everyone has joined. Leaving before you start closes the table.',
    waitingFor: (host: string | null) => `Waiting for ${host ?? 'the host'} to start the game.`,
    atTheTable: 'At the table',
    starting: 'Starting…',
    startGame: (n: number) => `Start game · ${plural(n, 'player', 'players')}`,
    closeTable: 'Close table',
    closeTitle: 'Close this table?',
    closeBodyOthers: (others: number) =>
      `The game hasn't started, so leaving closes the table for everyone — ${plural(others, 'player', 'players')} will be told.`,
    closeBodyAlone: "The game hasn't started, so leaving closes the table.",
  },
  table: {
    stillPlaying: (playing: number, total: number) => `${playing} of ${total} still playing`,
    pot: 'Pot',
    youreIn: "You're in",
    players: 'Players',
    requests: (n: number) => (n === 1 ? 'Buy-in request' : `${n} buy-in requests`),
    deny: 'Deny',
    approve: 'Approve',
    myPending: (amounts: string[]) =>
      amounts.length === 1
        ? `Your request for ${amounts[0]} is waiting for the host to approve.`
        : `Your requests for ${amounts.join(', ')} are waiting for the host to approve.`,
    inAmount: (amount: string) => `In ${amount}`,
    outAmount: (amount: string) => `Out ${amount}`,
    outSoFar: (amount: string) => `Out ${amount} so far`,
    pending: (amounts: string[]) => `+${amounts.join(', ')} pending`,
    cashOut: 'Cash out',
    playing: 'Playing',
    endAndSettle: 'End game & settle up',
    buyIn: 'Buy in',
    cashedOutEdit: (amount: string) => `Out ${amount} · Edit`,
    rebuyPending: 'Re-buy pending',
    cancelRequest: (amount: string) => `Cancel ${amount}`,
    buyInsOf: (name: string) => `${name}'s buy-ins`,
    removeHint: 'Remove a buy-in that was approved by mistake.',
    removeHintNotify: ' They get a notification.',
    remove: 'Remove',
    removeTitle: (amount: string, name: string) => `Remove ${name}'s ${amount} buy-in?`,
    removeBody: 'It stops counting toward their total and the settlement.',
    buyInHintHost: 'As the host, your buy-ins are approved automatically.',
    buyInHintPlayer: 'The host approves it before it counts.',
    maxPerBuyIn: (max: string) => `Max ${max} per buy-in.`,
    addBuyIn: 'Add buy-in',
    sendRequest: 'Send request',
    cashOutName: (name: string) => `Cash out ${name}`,
    cashOutHintSelf: "Enter what you're leaving the table with — it's fine to enter ₪0.",
    cashOutHintOther: (name: string) =>
      `Enter how much ${name} left the table with — ₪0 if they busted. They'll get a notification.`,
    confirmCashOut: 'Confirm cash-out',
  },
  amount: {
    ariaLabel: 'Amount in shekels',
    overLimit: (max: string) => `That's over the ${max} limit for one buy-in.`,
  },
  settle: {
    title: 'Settle up',
    hint: 'Enter what each player left the table with — ₪0 if they busted. Money in has to match money out.',
    pendingWarning: (n: number) =>
      n === 1
        ? '1 buy-in request is still waiting — approve or deny it first.'
        : `${n} buy-in requests are still waiting — approve or deny them first.`,
    inAmount: (amount: string) => `In ${amount}`,
    earlierOut: (amount: string) => ` · ${amount} out earlier`,
    cashOutAria: (name: string) => `${name} cash-out`,
    fillRest: (name: string, amount: string) => `Fill ${name} with the rest — ${amount}`,
    moneyIn: 'Money in',
    moneyOut: 'Money out',
    status: 'Status',
    missing: (n: number) => `${n} missing`,
    balanced: 'Balanced ✓',
    over: (amount: string) => `Over ${amount}`,
    short: (amount: string) => `Short ${amount}`,
    acceptMismatch: (amount: string) => `The chips really don't add up — settle anyway, off by ${amount}.`,
    settling: 'Settling…',
    settle: 'Settle game',
  },
  settlement: {
    final: 'Final',
    won: 'Nice — you won tonight.',
    lost: 'Rough night. Next time.',
    even: 'You broke even.',
    seePayments: ' Your payments are in the Payments tab.',
    offBy: (amount: string) => `Buy-ins and cash-outs are off by ${amount} — payments below are the best available split.`,
    results: 'Results',
    whoPaysWhom: 'Who pays whom',
    allEven: 'Nobody owes anybody — everyone broke even.',
    goToPayments: 'Go to payments',
    done: 'Done',
  },
  leaderboard: {
    title: 'Leaderboard',
    sub: 'All-time results across every game.',
    empty: 'No results yet',
    emptySub: 'Finish a game and the standings show up here.',
    games: (n: number) => plural(n, 'game', 'games'),
    highlights: 'Highlights',
    hotStreak: 'Hot streak',
    winsInARow: (n: number) => `${n} wins in a row`,
    coldStreak: 'Cold streak',
    lossesInARow: (n: number) => `${n} losses in a row`,
    biggestWin: 'Biggest win',
    biggestLoss: 'Biggest loss',
  },
  games: {
    title: 'Games',
    sub: 'Every finished game, its results and payments.',
    empty: 'No finished games yet',
    emptySub: 'Once a host settles a game, its results and payments show up here.',
    paid: 'Paid ✓',
    waiting: 'Waiting',
    unpaid: 'Unpaid',
    offBy: (amount: string) => `Buy-ins and cash-outs were off by ${amount}.`,
  },
  payments: {
    title: 'Payments',
    sub: 'Settle up after the game — confirmed by whoever gets paid, any time.',
    youOwe: 'You owe',
    youreOwed: "You're owed",
    allSquare: 'All square',
    allSquareSub: 'Nobody owes anybody right now.',
    needToPay: 'You need to pay',
    waitingToConfirm: (name: string) => `Waiting for ${name} to confirm`,
    needToGet: 'You need to get',
    didTheySend: (name: string, amount: string) => `Did ${name} send you ${amount}?`,
    notYet: 'Not yet',
    gotIt: 'Got it',
    waitingToPay: (name: string) => `Waiting for ${name} to pay`,
    showDone: (n: number) => `Show completed (${n})`,
    hideDone: (n: number) => `Hide completed (${n})`,
    iPaid: "I've paid",
    tapWhenPaid: "Paid? Tap here",
    payName: (name: string) => `Pay ${name}`,
    payConfirmBody: (name: string) => `Only tap once the money is sent — ${name} will be asked to confirm it arrived.`,
  },
};

export type Strings = typeof en;

// Hebrew: gender-neutral where it's about another player (a name doesn't tell
// us), infinitive/noun forms for buttons, "קנייה" = buy-in, "פדיון" = cash-out.
const he: Strings = {
  appName: 'ערב פוקר',
  common: {
    cancel: 'ביטול',
    saving: 'שומר…',
    loading: 'טוען…',
    you: 'את/ה',
    youSuffix: ' · את/ה',
    youParen: ' (את/ה)',
    host: 'מארח',
    live: 'פעיל',
    back: 'חזרה',
    backToTables: 'חזרה לשולחנות',
    players: (n) => (n === 1 ? 'שחקן אחד' : `${n} שחקנים`),
    networkError: 'אין חיבור לשרת.',
  },
  install: {
    body: 'האפליקציה עובדת רק כשהיא מותקנת — יש להוסיף אותה למסך הבית כדי לפתוח אותה.',
    installing: 'מתקין…',
    install: 'התקנת האפליקציה',
    iosStep1Before: 'לוחצים על כפתור',
    share: 'השיתוף',
    iosStep1After: 'בסרגל של ספארי',
    iosStep2Before: 'גוללים למטה ולוחצים על',
    addToHome: 'הוספה למסך הבית',
    iosStep3Tap: 'לוחצים על',
    add: 'הוספה',
    iosStep3Open: ', ואז פותחים את',
    iosStep3After: 'ממסך הבית',
    otherBrowsers:
      'יש לפתוח את הדף בטלפון בכרום או בספארי, ואז לבחור בתפריט הדפדפן "הוספה למסך הבית" / "התקנת אפליקציה". (דפדפני מחשב שלא תומכים בהתקנת PWA לא יכולים לפתוח את האפליקציה.)',
  },
  app: {
    opening: 'פותח את ערב פוקר…',
    backToTable: 'חזרה לשולחן',
    settings: 'הגדרות',
    oneMoreThing: 'עוד דבר אחד',
    addPhoneSub: 'מוסיפים מספר טלפון כדי שחברים יוכלו לשלם לך אחרי משחק.',
    continue: 'המשך',
    loadingGame: 'טוען משחק…',
    tabs: { tables: 'שולחנות', leaderboard: 'דירוג', games: 'משחקים', payments: 'תשלומים' },
  },
  login: {
    tagline: 'קניות, פדיונות ומי משלם למי — הכול מסודר למשחק הבית שלכם.',
    logIn: 'התחברות',
    signUp: 'הרשמה',
    username: 'שם משתמש',
    usernamePlaceholderNew: 'איך החברים קוראים לך',
    usernamePlaceholder: 'השם שלך',
    password: 'סיסמה',
    passwordPlaceholderNew: 'לפחות 6 תווים',
    phone: 'מספר טלפון',
    phoneWhy: '· חברים משלמים לך למספר הזה',
    loggingIn: 'מתחבר…',
    creating: 'יוצר חשבון…',
    create: 'יצירת חשבון',
  },
  phone: {
    label: 'מספר טלפון',
  },
  settings: {
    title: 'הגדרות',
    noPhone: 'אין מספר טלפון',
    account: 'חשבון',
    name: 'שם',
    change: 'שינוי',
    newName: 'שם חדש',
    currentPassword: 'סיסמה נוכחית',
    confirmItsYou: 'כדי לוודא שזה את/ה',
    saveName: 'שמירת השם',
    nameUpdated: 'השם עודכן.',
    phoneLabel: 'טלפון · חברים משלמים לך למספר הזה',
    notSet: 'לא הוגדר',
    saveNumber: 'שמירת המספר',
    phoneUpdated: 'מספר הטלפון עודכן.',
    language: 'שפה',
    logOut: 'התנתקות',
    logOutTitle: 'להתנתק?',
    logOutBody: 'כדי להתחבר שוב יהיה צורך בשם המשתמש והסיסמה.',
    addPhoto: 'הוספת תמונה',
    changePhoto: 'החלפת תמונה',
    removePhoto: 'הסרה',
    uploadingPhoto: 'מעלה…',
    photoUpdated: 'התמונה עודכנה.',
    photoRemoved: 'התמונה הוסרה.',
    photoUnreadable: 'אי אפשר לפתוח את התמונה הזו — כדאי לנסות תמונה אחרת.',
  },
  tables: {
    title: 'שולחנות',
    sub: 'פותחים את המשחק של הערב או חוזרים לשולחן.',
    newGame: 'משחק חדש',
    heroSub: 'את/ה המארח — החברים יראו את השולחן כאן ויצטרפו בלחיצה.',
    starting: 'פותח…',
    start: 'פתיחת שולחן',
    happeningNow: 'משחקים עכשיו',
    noTables: 'אין שולחנות כרגע',
    noTablesSub: 'פותחים שולחן למעלה — כל מי שיש לו את האפליקציה יראה אותו.',
    inLobby: 'בלובי',
    onTheTable: 'על השולחן',
    join: 'הצטרפות',
  },
  sessionName: {
    days: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
    morning: 'בבוקר',
    afternoon: 'בצהריים',
    evening: 'בערב',
    night: 'בלילה',
    format: (day, time) => `${day} ${time}`,
  },
  lobby: {
    lobby: 'לובי',
    hostHint: 'מתחילים את המשחק כשכולם הצטרפו. יציאה לפני ההתחלה סוגרת את השולחן.',
    waitingFor: (host) => (host ? `מחכים להתחלת המשחק על ידי ${host}.` : 'מחכים שהמארח יתחיל את המשחק.'),
    atTheTable: 'ליד השולחן',
    starting: 'מתחיל…',
    startGame: (n) => `התחלת המשחק · ${n === 1 ? 'שחקן אחד' : `${n} שחקנים`}`,
    closeTable: 'סגירת השולחן',
    closeTitle: 'לסגור את השולחן?',
    closeBodyOthers: (others) =>
      `המשחק עוד לא התחיל, אז יציאה סוגרת את השולחן לכולם — ${others === 1 ? 'שחקן אחד יקבל' : `${others} שחקנים יקבלו`} הודעה.`,
    closeBodyAlone: 'המשחק עוד לא התחיל, אז יציאה סוגרת את השולחן.',
  },
  table: {
    stillPlaying: (playing, total) => `${playing} מתוך ${total} עדיין משחקים`,
    pot: 'קופה',
    youreIn: 'השקעת',
    players: 'שחקנים',
    requests: (n) => (n === 1 ? 'בקשת קנייה' : `${n} בקשות קנייה`),
    deny: 'דחייה',
    approve: 'אישור',
    myPending: (amounts) =>
      amounts.length === 1
        ? `הבקשה שלך על ${amounts[0]} מחכה לאישור המארח.`
        : `הבקשות שלך על ${amounts.join(', ')} מחכות לאישור המארח.`,
    inAmount: (amount) => `נכנס ${amount}`,
    outAmount: (amount) => `יצא ${amount}`,
    outSoFar: (amount) => `יצא עד עכשיו ${amount}`,
    pending: (amounts) => `+${amounts.join(', ')} ממתין`,
    cashOut: 'פדיון',
    playing: 'בשולחן',
    endAndSettle: 'סיום המשחק והתחשבנות',
    buyIn: 'קנייה',
    cashedOutEdit: (amount) => `יצא ${amount} · עריכה`,
    rebuyPending: 'קנייה חוזרת ממתינה',
    cancelRequest: (amount) => `ביטול ${amount}`,
    buyInsOf: (name) => `הקניות של ${name}`,
    removeHint: 'הסרה של קנייה שאושרה בטעות.',
    removeHintNotify: ' תישלח על זה הודעה.',
    remove: 'הסרה',
    removeTitle: (amount, name) => `להסיר את הקנייה של ${name} על סך ${amount}?`,
    removeBody: 'היא לא תיספר יותר בסכום ובהתחשבנות.',
    buyInHintHost: 'בתור המארח, הקניות שלך מאושרות אוטומטית.',
    buyInHintPlayer: 'המארח צריך לאשר לפני שזה נספר.',
    maxPerBuyIn: (max) => `עד ${max} לקנייה.`,
    addBuyIn: 'הוספת קנייה',
    sendRequest: 'שליחת בקשה',
    cashOutName: (name) => `פדיון עבור ${name}`,
    cashOutHintSelf: 'מזינים עם כמה יוצאים מהשולחן — אפשר גם ₪0.',
    cashOutHintOther: (name) => `מזינים את סכום היציאה של ${name} — ₪0 אם נגמרו הצ׳יפים. תישלח על זה הודעה.`,
    confirmCashOut: 'אישור פדיון',
  },
  amount: {
    ariaLabel: 'סכום בשקלים',
    overLimit: (max) => `זה מעל המגבלה של ${max} לקנייה אחת.`,
  },
  settle: {
    title: 'התחשבנות',
    hint: 'מזינים עם כמה כל שחקן יצא מהשולחן — ₪0 אם נגמרו הצ׳יפים. הכסף שנכנס צריך להיות שווה לכסף שיצא.',
    pendingWarning: (n) =>
      n === 1 ? 'בקשת קנייה אחת עדיין ממתינה — יש לאשר או לדחות אותה קודם.' : `${n} בקשות קנייה עדיין ממתינות — יש לאשר או לדחות אותן קודם.`,
    inAmount: (amount) => `נכנס ${amount}`,
    earlierOut: (amount) => ` · יצא קודם ${amount}`,
    cashOutAria: (name) => `פדיון של ${name}`,
    fillRest: (name, amount) => `למלא ל-${name} את היתרה — ${amount}`,
    moneyIn: 'נכנס',
    moneyOut: 'יצא',
    status: 'מצב',
    missing: (n) => `חסרים ${n}`,
    balanced: 'מאוזן ✓',
    over: (amount) => `עודף ${amount}`,
    short: (amount) => `חסר ${amount}`,
    acceptMismatch: (amount) => `הצ׳יפים באמת לא מסתדרים — להתחשבן בכל זאת, עם פער של ${amount}.`,
    settling: 'מתחשבן…',
    settle: 'סגירת המשחק',
  },
  settlement: {
    final: 'סיכום',
    won: 'יפה — ניצחת הערב.',
    lost: 'ערב קשה. בפעם הבאה.',
    even: 'יצאת באפס.',
    seePayments: ' התשלומים שלך נמצאים בלשונית תשלומים.',
    offBy: (amount) => `יש פער של ${amount} בין הקניות לפדיונות — התשלומים למטה הם החלוקה הכי טובה שאפשר.`,
    results: 'תוצאות',
    whoPaysWhom: 'מי משלם למי',
    allEven: 'אף אחד לא חייב כלום — כולם יצאו באפס.',
    goToPayments: 'לתשלומים',
    done: 'סיום',
  },
  leaderboard: {
    title: 'דירוג',
    sub: 'תוצאות של כל הזמנים מכל המשחקים.',
    empty: 'אין עדיין תוצאות',
    emptySub: 'מסיימים משחק והדירוג יופיע כאן.',
    games: (n) => (n === 1 ? 'משחק אחד' : `${n} משחקים`),
    highlights: 'שיאים',
    hotStreak: 'רצף חם',
    winsInARow: (n) => `${n} ניצחונות ברצף`,
    coldStreak: 'רצף קר',
    lossesInARow: (n) => `${n} הפסדים ברצף`,
    biggestWin: 'הניצחון הגדול',
    biggestLoss: 'ההפסד הגדול',
  },
  games: {
    title: 'משחקים',
    sub: 'כל משחק שהסתיים, התוצאות והתשלומים שלו.',
    empty: 'אין עדיין משחקים שהסתיימו',
    emptySub: 'אחרי שמארח סוגר משחק, התוצאות והתשלומים יופיעו כאן.',
    paid: 'שולם ✓',
    waiting: 'ממתין',
    unpaid: 'לא שולם',
    offBy: (amount) => `היה פער של ${amount} בין הקניות לפדיונות.`,
  },
  payments: {
    title: 'תשלומים',
    sub: 'מתחשבנים אחרי המשחק — מי שמקבל את הכסף מאשר.',
    youOwe: 'עליך לשלם',
    youreOwed: 'חייבים לך',
    allSquare: 'הכול סגור',
    allSquareSub: 'אף אחד לא חייב כלום כרגע.',
    needToPay: 'צריך לשלם',
    waitingToConfirm: (name) => `מחכים לאישור של ${name}`,
    needToGet: 'צריך לקבל',
    didTheySend: (name, amount) => `קיבלת ${amount} מ-${name}?`,
    notYet: 'עוד לא',
    gotIt: 'קיבלתי',
    waitingToPay: (name) => `מחכים לתשלום של ${name}`,
    showDone: (n) => `הצגת תשלומים שהושלמו (${n})`,
    hideDone: (n) => `הסתרת תשלומים שהושלמו (${n})`,
    iPaid: 'שילמתי',
    tapWhenPaid: 'שילמת? לחיצה כאן',
    payName: (name) => `תשלום ל-${name}`,
    payConfirmBody: (name) => `לוחצים רק אחרי שהכסף נשלח — תישלח ל-${name} בקשה לאשר שהוא הגיע.`,
  },
};

const DICTS: Record<Lang, Strings> = { en, he };
const LANG_KEY = 'poker.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage blocked — fall through to the device language */
  }
  return navigator.language?.toLowerCase().startsWith('he') ? 'he' : 'en';
}

export let lang: Lang = initialLang();
export let tr: Strings = DICTS[lang];

/** BCP 47 tag for `toLocaleDateString` etc. */
export const locale = () => (lang === 'he' ? 'he-IL' : 'en-US');

function applyToDocument(): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.title = tr.appName;
}
applyToDocument();

const listeners = new Set<(l: Lang) => void>();

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  tr = DICTS[next];
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    /* not remembered across launches, still applies now */
  }
  applyToDocument();
  listeners.forEach((l) => l(next));
}

/** Re-renders the calling component (and so its whole subtree) when the language changes. */
export function useLang(): Lang {
  const [current, setCurrent] = useState(lang);
  useEffect(() => {
    listeners.add(setCurrent);
    setCurrent(lang);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return current;
}

