const Nick = require("nickjs")
const nick = new Nick()

var subjects = {},
		courses = {},
		sessions = {}

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
			var sub = subject[1].split(/ - /);
			subjects[sub[0]]={title:sub[1]};
			// expand the subject
			await tab.click("#"+subject[0])
			await tab.untilVisible('table.PSLEVEL2GRIDWBO, table.PSGROUPBOXWBO .PSTEXT',10000)
      // get courses if there are any
			const coursesAvailable = await tab.isVisible('table.PSLEVEL2GRIDWBO')
			if (coursesAvailable) {
				const courseLinks = await tab.evaluate((arg,done)=>{done(null, [].slice.call(document.querySelectorAll('table.PSLEVEL2GRID tr[id]')).map(x=>[x.querySelector('a[name*=CRSE_NB]').id.replace(/\$/g,'\\24 '), x.querySelector('a[name*=CRSE_NB]').textContent, x.querySelector('a[name*=CRSE_TITLE]').textContent]) )},{})
				for (var k=0; k<courseLinks.length; k++){
					var course = courseLinks[k]
					console.log("Found a course named "+course[2])
					courses[course[1]]={title:course[2]}
					// Go to the course page to get extended meta and get sessions
					await tab.click("#"+course[0])
					await tab.untilVisible('#DERIVED_SAA_CRS_RETURN_PB',10000)
					const meta = await tab.evaluate((arg,done)=>{
						var course = {}
						var get = (q)=>(n = document.querySelector(q))? n.textContent:null
						course.career = get('span[id*=SSR_CRSE_OFF_VW_ACAD_CAREER]')
						course.units = get('span[id*=DERIVED_CRSECAT_UNITS_RANGE]')
						course.gradingBasis = get('span[id*=SSR_CRSE_OFF_VW_GRADING_BASIS]')
						course.components = [].slice.call(document.querySelectorAll('table[id*=ACE_SSR_DUMMY_RECVW] tr')).filter(n=>(n.querySelector('[id*=win0divDERIVED_CRSECAT_DESCR]'))).map(n=>(r =n.querySelectorAll('[id*=win0divDERIVED_CRSECAT_DESCR] span'))?{title:r[0].textContent,status:r[1].textContent}:null)
						course.academicGroup = get('span[id*=ACAD_GROUP_TBL_DESCR]')
						course.academicOrganization = get('span[id*=ACAD_ORG_TBL_DESCR]')
						course.requirementDesignation = get('span[id*=DERIVED_CRSECAT_DESCRFORMAL]')
						course.academicOrganization = get('span[id*=DERIVED_CRSECAT_SSR_CRSE_ATTR_LONG]')
						course.description = get('span[id*=SSR_CRSE_OFF_VW_DESCRLONG]')
						done(null, course)
					},null)
					courses[course[1]] = Object.assign(courses[course[1]], meta);
					console.log(courses[course[1]])
					await tab.click("#DERIVED_SAA_CRS_RETURN_PB")
					await tab.whileVisible('#DERIVED_SAA_CRS_RETURN_PB',10000)
				}
			}
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
	console.log("Found these courses")
	console.log(JSON.stringify(courses))
	nick.exit()
})
.catch((err) => {
	console.log(`Something went wrong: ${err}`)
	nick.exit(1)
})
