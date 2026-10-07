// Real road names and everyday Naija street life. Shop names are invented.
export const CITIES = {
  Lagos: {
    code: 'LOS', tag: 'EKO', blurb: 'Danfo wahala · Island traffic',
    roads: ['IKORODU ROAD', 'HERBERT MACAULAY WAY', 'OJUELEGBA ROAD', 'AWOLOWO ROAD', 'ADEOLA ODEKU STREET', 'OZUMBA MBADIWE AVENUE', 'BROAD STREET', 'MARINA', 'ALLEN AVENUE', 'OBAFEMI AWOLOWO WAY'],
    areas: ['YABA', 'SURULERE', 'IKOYI', 'VICTORIA ISLAND', 'LAGOS ISLAND', 'IKEJA', 'OSHODI', 'OBALENDE'],
    shops: ['MAMA PUT BUKA', 'GOD\'S TIME IS BEST VENTURES', 'EKO SUYA SPOT', 'BLESSED HANDS PHARMACY', 'NO WAHALA PHONES', 'IYA BASIRA AMALA', 'GLORY BE SUPERMARKET', 'OGA MECHANIC WORKSHOP', 'FAITH BARBING SALON', 'ISLAND POINT AND KILL', 'DIVINE FAVOUR FABRICS', 'NNEKA HAIR STUDIO', 'ALHAJI CEMENT DEPOT', 'JESUS IS LORD BOOKSHOP'],
    billboards: [['EKO O NI BAJE', 'Lagos no go spoil'], ['JOLLOF WEEKEND', 'Party rice delivered hot'], ['NAIJA DATA', '10GB for small money'], ['DRIVE SAFE', 'Overspeeding kills · FRSC']],
    calls: ['OSHODI! OSHODI!', 'CMS! ENTER WITH CHANGE!', 'OJUELEGBA, WOLE!', 'YABA! YABA!', 'OBALENDE! OYA!', 'IKEJA ALONG!', 'MILE 2! MILE 2!'],
    ground: '#9d8467', sky: '#a9c7d6', haze: '#cfd3c7', water: true,
    palette: ['#d8c3a0', '#c9b79a', '#e3d6bd', '#b9a58b', '#d6b48c', '#c6cbbf', '#e4c99b', '#a7b3a9'],
  },
  Abuja: {
    code: 'ABV', tag: 'FCT', blurb: 'Capital boulevards · Aso Rock views',
    roads: ['AHMADU BELLO WAY', 'SHEHU SHAGARI WAY', 'CONSTITUTION AVENUE', 'INDEPENDENCE AVENUE', 'HERBERT MACAULAY WAY', 'AMINU KANO CRESCENT', 'ADETOKUNBO ADEMOLA CRESCENT', 'MURTALA MUHAMMED EXPRESSWAY'],
    areas: ['WUSE II', 'MAITAMA', 'GARKI', 'ASOKORO', 'CENTRAL AREA', 'JABI', 'UTAKO'],
    shops: ['WUSE MARKET STALLS', 'NORTHERN SUYA HOUSE', 'CAPITAL PHARMACY', 'MAI SHAYI TEA SPOT', 'GREEN CITY PLAZA', 'AREWA FABRICS', 'JABI LAKE GRILL', 'UNITY PHONES', 'SAHEL KITCHEN', 'ZUMA AUTOS'],
    billboards: [['CENTRE OF UNITY', 'Federal Capital Territory'], ['TOZO SPECIAL', 'Fresh suya every night'], ['NAIJA DATA', '10GB for small money'], ['DRIVE SAFE', 'Overspeeding kills · FRSC']],
    calls: ['WUSE! WUSE!', 'BERGER! BERGER!', 'NYANYA! ENTER!', 'GARKI! GARKI!', 'KUBWA EXPRESS!'],
    ground: '#8a8a63', sky: '#b4cfdc', haze: '#d6d9cc', water: false,
    palette: ['#e6e1d3', '#cfd6d0', '#d9cfb8', '#bfc8c4', '#ece6d8', '#c8bfae', '#dfe3dc', '#b8c2b9'],
  },
}

// price: RP to unlock in the garage (0 = free from the start). Top speeds are kept modest so racing through traffic stays readable.
export const CARS = [
  { name: 'Peugeot 504', year: '1982', tag: 'THE ORIGINAL OG', price: 0, speed: 120, acceleration: 21, handling: 64, engine: { cyl: 4, idle: 850, redline: 5500, rasp: .75, lope: .14, wake: 3000, intake: .2, header: .7, tail: 2.2, muffle: .35, label: '2.0 XN1 OHV I4 · carb' } },
  { name: 'Mercedes 190E', year: '1991', tag: 'GERMAN MACHINE', price: 0, speed: 140, acceleration: 27, handling: 76, engine: { cyl: 4, idle: 750, redline: 6200, rasp: .28, lope: .03, wake: 4200, intake: .55, header: .9, tail: 2.8, muffle: .85, label: '2.3 M102 I4 · fuel injection' } },
  { name: 'Toyota Camry', year: '2003', tag: 'BIG DADDY', price: 2500, speed: 150, acceleration: 32, handling: 80, engine: { cyl: 6, idle: 650, redline: 6200, rasp: .3, lope: .02, wake: 4600, intake: .35, header: .6, tail: 3.0, muffle: .7, label: '3.0 1MZ-FE V6' } },
  { name: 'Dodge Challenger', year: '2023', tag: 'NEW SCHOOL MUSCLE', price: 12000, speed: 195, acceleration: 44, handling: 70, engine: { cyl: 8, idle: 620, redline: 5800, rasp: .6, lope: .4, wake: 3200, intake: .2, header: 1.0, tail: 2.4, muffle: .3, label: '5.7 HEMI V8' } },
  { name: 'Toyota Corolla', year: '2005', tag: 'DADDY GO SLOW', price: 0, speed: 130, acceleration: 24, handling: 74, engine: { cyl: 4, idle: 700, redline: 6400, rasp: .3, lope: .02, wake: 4800, intake: .45, header: .6, tail: 2.6, muffle: .8, label: '1.8 1ZZ-FE I4 · VVT-i' } },
  { name: 'Honda Accord', year: '2008', tag: 'EVIL SPIRIT', price: 5000, speed: 160, acceleration: 36, handling: 82, engine: { cyl: 6, idle: 680, redline: 6800, rasp: .38, lope: .03, wake: 4300, intake: .5, header: .7, tail: 2.8, muffle: .6, label: '3.5 J35 V6 · i-VTEC' } },
  { name: 'Lexus RX 350', year: '2010', tag: 'BIG MAN JEEP', price: 3500, speed: 150, acceleration: 31, handling: 62, engine: { cyl: 6, idle: 640, redline: 6300, rasp: .22, lope: .02, wake: 4800, intake: .3, header: .65, tail: 3.2, muffle: .9, label: '3.5 2GR-FE V6' } },
  { name: 'Mercedes G63', year: '2021', tag: 'DO YOU KNOW WHO I AM', price: 9000, speed: 175, acceleration: 42, handling: 58, engine: { cyl: 8, idle: 650, redline: 6500, rasp: .65, lope: .3, wake: 3000, intake: .35, header: .85, tail: 2.2, muffle: .35, label: '4.0 M177 biturbo V8' } },
]

// What other road users shout at you, in Lagos pidgin and street slang.
export const SLANG = {
  crash: {
    danfo: ['WEREY! YOU NO GET EYE?', 'OGA, YOU WAN KILL ME NI?', 'ODE! YOU GO PAY FOR THIS!', 'WHO GIVE THIS ONE LICENCE?', 'NA WA O! MY MOTOR!', 'SEE AS YOU JAM MY BUMPER!', 'YOUR HEAD NO CORRECT!', 'OYA COME DOWN, MAKE WE TALK!'],
    car: ['ARE YOU MAD?!', 'CAN\'T YOU SEE?!', 'JESUS! MY CAR!', 'YOU WILL FIX THIS TODAY!', 'ABEG WETIN DEY DO YOU?', 'SEE ME SEE TROUBLE O!', 'I DON SUFFER FOR THIS COUNTRY!', 'JEHOVAH!'],
    taxi: ['OGA, NA MY DAILY BREAD YOU JAM!', 'YOU GO PAY MY OWNER!', 'CHAI! MY TAXI!'],
    keke: ['ABEG GENTLY! NA KEKE O!', 'YOU WAN FLAT ME?!', 'CHAI! MY PASSENGERS!'],
    okada: ['OYA PAY ME NOW NOW!', 'YOU WAN KILL PERSON?!', 'I NO GO GREE O!', 'MY LEG! MY LEG!'],
    brt: ['THIS NA GOVERNMENT PROPERTY O!', 'BRT NO BE YOUR MATE!', 'YOU DON CRAZE?!'],
    luxury: ['DO YOU KNOW WHO I AM?!', 'DO YOU KNOW WHO I AM?! I GO CALL MY OGA!', 'YOU DON JAM BIG MAN MOTOR!', 'THIS CAR COST PASS YOUR HOUSE!', 'DO YOU KNOW WHO I AM?! YOU GO SEE!'],
    police: ['YOU DEY CRAZE? YOU HIT OFFICER?!', 'YOU DON ENTER TROUBLE TODAY!', 'STOP THERE! STOP!'],
  },
  // Mercedes, Challenger, Lexus and G-Wagon owners are big men, and want you to know it.
  isLuxury: e => e.kind === 'car' && [1, 3, 6, 7].includes(e.model),
  raceJoin: ['I DEY THIS RACE TOO!', 'COUNT ME IN!', 'OYA, MAKE WE SEE WHO BE OGA!'],
  ramming: ['COMOT FOR ROAD!', 'SHIFT! NA MY LINE BE THIS!', 'YOU NO FIT PASS ME!'],
  rammed: ['HOW E TASTE?! I GO HIT YOU AGAIN!', 'YOU NO GO ESCAPE TODAY!', 'OLOKPA GO MEET YOU FOR HERE!', 'I GO SCATTER YOUR BUMPER!', 'WAIT! I NEVER FINISH WITH YOU!'],
  blocking: ['YOU NO DEY PASS! OLOKPA DEY COME!', 'SIDDON THERE TILL POLICE REACH!', 'OGA POLICE, NA HIM BE THIS O!'],
  fight: ['WHO YOU BE?! COMOT FOR MY ROAD!', 'YOU DEY DRIVE LIKE SAY NA YOUR PAPA ROAD!', 'I GO TEACH YOU LESSON TODAY!', 'SHIFT OR I JAM YOU!', 'YOU DEY LOOK ME? WAIT!'],
  cutIn: ['COMOT!', 'NA ME GET ROAD!', 'MUMU DRIVER, SHIFT!', 'OYA GIVE WAY!', 'YOU NO SEE DANFO?!'],
  nitroHit: ['WETIN BE THIS?! JET?!', 'HE DON USE NITRO O!', 'MY MOTOR! YOU DEY CRAZE!', 'FAST AND FURIOUS FOR LAGOS?!'],
  followed: ['YOU THINK SAY CORNER GO SAVE YOU?!', 'I SABI THIS ROAD PASS YOU!', 'WHERE YOU DEY RUN GO? I DEY YOUR BACK!'],
  splash: ['WETIN BE THIS?! RIVER FOR ROAD?', 'GOVERNMENT, FIX THIS ROAD NAU!', 'ROAD DON TURN SWIMMING POOL!', 'NA RAINY SEASON POTHOLE BE THAT!'],
  rage: ['YOU NO GO GO ANYWHERE! I DEY COME!', 'TODAY NA TODAY! I GO CATCH YOU!', 'YOU JAM ME, YOU RUN? WAIT FOR ME!', 'OYA STOP THERE! YOU MUST PAY!'],
  rageLuxury: ['DO YOU KNOW WHO I AM?! STOP THAT CAR!', 'I GO FOLLOW YOU REACH YOUR HOUSE!'],
  rageWon: ['OYA GO! YOU WIN THIS ONE!', 'NO WAHALA, YOU SABI DRIVE!', 'I DON TIRE FOR YOU!'],
  rageLost: ['PAY ME FOR MY BUMPER NOW NOW!', 'YOU SEE YOURSELF? OYA PAY!', 'NEXT TIME YOU GO RESPECT ROAD!'],
  rageHonk: ['STOP THERE!', 'WHERE YOU DEY RUN GO?!', 'YOU GO PAY TODAY!', 'COME DOWN NOW NOW!', 'WEREY, PARK!'],
  // Drivers shouting at each other
  npcHonk: {
    keke: ['KEKE, COMOT FOR ROAD!', 'THIS KEKE DEY CRAWL LIKE SNAIL!'],
    okada: ['OKADA, YOU WAN DIE?!', 'SHIFT, OKADA!'],
    danfo: ['DANFO, MOVE NOW!', 'NA YOUR PAPA GET ROAD?'],
    brt: ['THIS BRT SEF!', 'BIG BUS, MOVE!'],
    car: ['OGA, MOVE!', 'YOU DEY SLEEP?!', 'DRIVE ABEG!'],
    taxi: ['TAXI, SHIFT!', 'YOU DEY PICK PASSENGER FOR MIDDLE ROAD?'],
    player: ['OGA, MOVE YOUR MOTOR!', 'YOU DEY BLOCK ROAD!', 'DRIVE OR PARK!'],
  },
  npcCrash: ['YOU NO GET EYE?!', 'SEE WETIN YOU DO MY MOTOR!', 'NA YOU JAM ME!', 'WEREY! COME DOWN!', 'YOUR HEAD NO CORRECT!'],
  npcCrashReply: ['NA YOU BRAKE ANYHOW!', 'WHO TEACH YOU DRIVING?', 'I NO GO PAY!', 'GO AND MEET MY OGA!'],
  jamAhead: ['GO-SLOW AHEAD! Lagos traffic don hold.', 'TRAFFIC! Na Lagos be this. Weave am or wait.', 'GO-SLOW! Danfos dey use shoulder already.'],
  scrape: ['SHIFT! SHIFT!', 'YOU DEY SCRATCH MY BODY!', 'ODE, LEAVE MY LANE!', 'MUMU DRIVER!', 'ABEG, GIVE ME SPACE!'],
  nearMiss: ['CRAZE DEY WORRY AM!', 'SLOW DOWN JARE!', 'WETIN DEY HURRY YOU?', 'SPEED NO BE MONEY O!', 'WHO SEND YOU?!'],
  raceStart: { danfo: ['OYA FOLLOW ME IF YOU SABI!', 'I GO SHOW YOU PEPPER TODAY!', 'NA DANFO YOU WAN RACE? OK O!'], car: ['CATCH ME IF YOU CAN!', 'YOU NO FIT ME!', 'OYA, LET\'S GO!'] },
  rivalLeads: ['SEE YOUR LIFE! YOU SLOW PASS TORTOISE!', 'NA ME BE KING OF THIS ROAD!', 'COME AND TAKE IT!'],
  raceWon: ['NA LUCK YOU GET!', 'NEXT TIME, I GO SHOW YOU!', 'OK O, YOU TRY!'],
  raceLost: ['GO AND LEARN DRIVING!', 'I TALK AM! YOU NO FIT ME!', 'SMALL BOY, GO HOME!'],
}
export const pickLine = (list, n = Math.random()) => list[Math.floor(n * list.length) % list.length]

export const roadAt = (city, metres) => CITIES[city].roads[Math.abs(Math.floor(metres / 420)) % CITIES[city].roads.length]
export const areaAt = (city, metres) => CITIES[city].areas[Math.abs(Math.floor(metres / 840)) % CITIES[city].areas.length]
