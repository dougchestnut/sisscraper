const Nick = require("nickjs")
const nick = new Nick()

var subjects = {},
    sections = {},
		courses = {}

;(async () => {
	const tab = await nick.newTab()
	// sis home
	console.log("go to home")
	await tab.open("https://sisuva.admin.virginia.edu/psp/ihprd/EMPLOYEE/EMPL/h/?tab=PAPP_GUEST")
  await tab.untilVisible("#crefli_UV_HC_SSS_BROWSE_CATLG_GBL3")
	// click the browse catalog link
	console.log("browse catalog")
	await tab.click("#crefli_UV_HC_SSS_BROWSE_CATLG_GBL3 > a")
	await tab.untilVisible("iframe") // Make sure we have loaded the page
	// open the iframe in the tab
	console.log("open iframe in tab")
	const framesrc = await tab.evaluate((arg,done)=>{done(null, document.querySelector('iframe').getAttribute('src'))}, {});
	await tab.wait(1000)
	await tab.open(framesrc)
	const subjectDivisions = await tab.evaluate((arg,done)=>{done(null, [].slice.call(document.querySelectorAll('#ACE_\\24 ICField52 a')).map(x=>[x.id,x.textContent]) )}, {})
  for (var i=0; i<subjectDivisions.length; i++) {
	  var subjectDivLink = subjectDivisions[i][0]
		console.log("Looking at subjects that start with "+subjectDivisions[i][1])
		await tab.click('#'+subjectDivLink)
		await tab.wait(2000)  // Wait for subjects to load
		// expand each subject
		const subjectTitles = await tab.evaluate((arg,done)=>{done(null, [].slice.call(document.querySelectorAll('table.PABACKGROUNDINVISIBLEWBO[id] div a[class=PSHYPERLINK]')).map(x=>[x.id.replace(/\$/g,'\\24 '),x.textContent]) )},{})
		for (var j=0; j<subjectTitles.length; j++){
			var subject = subjectTitles[j]
			console.log("Found a subject named "+subject[1])
			var keyName = subject[1].split(/ - /);
			subjects[keyName[0]]=keyName[1];
			// expand the subject
			await tab.click("#"+subject[0])
			await tab.untilVisible('table.PSLEVEL2GRIDWBO, table.PSGROUPBOXWBO .PSTEXT',10000)
      // get courses if there are any
			const coursesAvailable = await tab.isVisible('table.PSLEVEL2GRIDWBO')
			if (coursesAvailable) console.log("we have courses!!!!!")
			// close the subject
			await tab.click("#"+subject[0])
			await tab.whileVisible('table.PSLEVEL2GRIDWBO, table.PSGROUPBOXWBO .PSTEXT',10000)
		}
	}
})()
.then(() => {
	console.log("Job done!")
	console.log("Found these subjects:")
	console.log(JSON.stringify(subjects))
	nick.exit()
})
.catch((err) => {
	console.log(`Something went wrong: ${err}`)
	nick.exit(1)
})
