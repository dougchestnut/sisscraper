const Nick = require("nickjs")
const nick = new Nick()
const fs = require('fs');
const admin = require('firebase-admin');

var serviceAccount = require('/usr/local/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

var db = admin.firestore();
var areEqualShallow = function(a, b) {
    for(var key in a) {
        if(key != 'components' && a[key] !== b[key]) {
            return false;
        }
    }
    return true;
}
var sessionCache = {}
var getCreateUpdate = function(collection, docPath, data){
	if (!sessionCache[collection]) sessionCache[collection] = []
	var thedoc = db.collection(collection).doc(docPath)
if (!sessionCache[collection][docPath]) {
	thedoc.get().then(doc => {
		if (!doc.exists) {
			console.log("Doc path "+docPath)
			console.log('************************set data')
			thedoc.set(data)
			sessionCache[collection][docPath] = true
		} else {
			console.log('update if new?')
			if ( !areEqualShallow(doc.data(),data) ) {
				thedoc.update(data)
				sessionCache[collection][docPath] = true
				console.log("Doc path "+docPath)
				console.log('++++++++++++++++++++++++update data')
				console.log(doc.data())
				console.log(data)
			}
		}
	})
} else {
	console.log("Already touched this!!!")
}
}

var startScrape = async function(startSubjectDiv, startSubjectTitle, startCourse, startTerm, startSection){

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
	//subjectDivisions.reverse()
	for (var i=0; i<subjectDivisions.length; i++) {
	startSubjectDiv = (subjectDivisions[i][1]===startSubjectDiv)? false: startSubjectDiv;
	if (!startSubjectDiv) {
		var subjectDivLink = subjectDivisions[i][0]
		console.log("Looking at subjects that start with "+subjectDivisions[i][1])
		await tab.click('#'+subjectDivLink)
		await tab.wait(1000)
		await tab.whileVisible('#processing',60000)
		// expand each subject
		const subjectTitles = await tab.evaluate((arg,done)=>{done(null, [].slice.call(document.querySelectorAll('table.PABACKGROUNDINVISIBLEWBO[id] div a[class=PSHYPERLINK]')).map(x=>[x.id.replace(/\$/g,'\\24 '),x.textContent]) )},{})
		for (var j=0; j<subjectTitles.length; j++){
startSubjectTitle = (subject[1]===startSubjectTitle)? false: startSubjectTitle;
if (!startSubjectTitle) {
			var subject = subjectTitles[j]
			console.log("Found a subject named "+subject[1])
			var sub = subject[1].split(/ - /);
			var subjectID = sub[0].toLowerCase()

	//			db.collection('subjects').doc(sub[0]).update({title:sub[1]}, { create: true })
			getCreateUpdate('subjects', subjectID, {title:sub[1]})

			// expand the subject
			await tab.click("#"+subject[0])
			await tab.untilVisible('table.PSLEVEL2GRIDWBO, table.PSGROUPBOXWBO .PSTEXT',10000)
			// get courses if there are any
			const coursesAvailable = await tab.isVisible('table.PSLEVEL2GRIDWBO')
			if (coursesAvailable) {
				const courseLinks = await tab.evaluate((arg,done)=>{done(null, [].slice.call(document.querySelectorAll('table.PSLEVEL2GRID tr[id]')).map(x=>[x.querySelector('a[name*=CRSE_NB]').id.replace(/\$/g,'\\24 '), x.querySelector('a[name*=CRSE_NB]').textContent, x.querySelector('a[name*=CRSE_TITLE]').textContent]) )},{})
				for (var k=0; k<courseLinks.length; k++){
					var course = courseLinks[k]
					course[1] = course[1].replace(/[\(\)]/,'')
					var courseID = [subjectID,course[1].toLowerCase()].join('-')
					console.log("Found a course named "+course[2])

					//var dbCourse = db.collection('courses').doc(course[1])
					//dbCourse.update({title:course[2]}, { create: true })

					// Go to the course page to get extended meta and get sections
					await tab.click("#"+course[0])
					await tab.untilVisible('#DERIVED_SAA_CRS_RETURN_PB',60000)
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
					// Go ahead and load the course sections
					const sectionsAvailable = await tab.isVisible('#DERIVED_SAA_CRS_SSR_PB_GO')
					if (sectionsAvailable) {
						await tab.click('#DERIVED_SAA_CRS_SSR_PB_GO')
						await tab.untilVisible('select',60000)
						// go ahead and scrape all terms for this course
						const termsLinks = await tab.evaluate((arg,done)=>{done(null, [].slice.call(document.querySelectorAll('select option')).map(x=>[x.value,x.textContent]) )}, {})
						for (var l=0; l<termsLinks.length; l++) {
							var term = termsLinks[l]
							var termID = term[0].toLowerCase()

							//db.collection('terms').doc(term[0]).update({title:term[1]}, { create: true })
							getCreateUpdate('terms', termID, {title:term[1]})

	if (term[1].indexOf('2018')>=0) {
							// select term
							await tab.evaluate((arg,done)=>{
								document.querySelector('select').value = arg[0]
								done(null,null)
							}, term)
							// load sections for term (push "show sections" button)
							await tab.click('[id*=DERIVED_SAA_CRS_SSR_PB_GO][value="Show Sections"]')
							await tab.wait(1000)
							await tab.whileVisible('#processing',60000)
							// get the links for each section page
							const sectionLinks = await tab.evaluate((arg,done)=>{done(null, [].slice.call(document.querySelectorAll('td.PSLEVEL2GRIDODDROW a[id*=CLASS_SECTION]')).map(x=>[x.id.replace(/\$/g,'\\24 '), x.textContent]) )},{})
							for (var m=0; m<sectionLinks.length; m++) {
								console.log("Found section "+sectionLinks[m][1])
								await tab.click('#'+sectionLinks[m][0])
								await tab.untilVisible('#DERIVED_CLSRCH_DESCR200',60000)
								// scrape the section meta
								const sectionMeta = await tab.evaluate((arg,done)=>{
									var section = {}
									var get = (q)=>(n = document.querySelector(q))? n.textContent.replace("\n",''):null
									//section.term = get('#DERIVED_CLSRCH_SSS_PAGE_KEYDESCR').replace(/.*? \| (.*?) \| .*/,"$1")
									section.status = get('#SSR_CLS_DTL_WRK_SSR_DESCRSHORT')
									section.classNumber = get('#SSR_CLS_DTL_WRK_CLASS_NBR')
									section.session = get('span[id*=PSXLATITEM_XLATLONGNAME]')
									section.units = get('#SSR_CLS_DTL_WRK_UNITS_RANGE')
									section.instructionMode = get('#INSTRUCT_MODE_DESCR')
									section.dates = get('#SSR_CLS_DTL_WRK_SSR_DATE_LONG')
									section.grading = get('#GRADE_BASIS_TBL_DESCRFORMAL')
									section.location = get('#CAMPUS_LOC_VW_DESCR')
									section.campus = get('#CAMPUS_TBL_DESCR')
									section.capacity = get('#SSR_CLS_DTL_WRK_ENRL_CAP')
									section.enrollment = get('#SSR_CLS_DTL_WRK_ENRL_TOT')
									section.availableSeats = get('#SSR_CLS_DTL_WRK_AVAILABLE_SEATS')
									section.waitListCapacity = get('#SSR_CLS_DTL_WRK_WAIT_CAP')
									section.waitListTotal = get('#SSR_CLS_DTL_WRK_WAIT_TOT')
									section.daysTimes = get('[id*=MTG_SCHED]')
									section.room = get('[id*=MTG_LOC]')
									section.instructor = get('[id*=MTG_INSTR]')
									done(null, section)
								},null)
								sectionMeta.subject = subjectID
								sectionMeta.term = termID
								sectionMeta.course = courseID
								sectionMeta.id = sectionLinks[m][1].replace(/ \(.*/,'')

								var sectionID = [termID, courseID, sectionMeta.id.toLowerCase()].join('-')
								getCreateUpdate('sections', sectionID, sectionMeta)
								//db.collection('sections').doc(sectionMeta.id+'_'+sectionMeta.term).update(sectionMeta, { create: true })
	//								sections[sectionMeta.id+'_'+sectionMeta.term] = sectionMeta

								await tab.click('#CLASS_SRCH_WRK2_SSR_PB_CLOSE')
								await tab.untilVisible('#DERIVED_SAA_CRS_RETURN_PB',60000)
							}
	}
						}
					}

					//dbCourse.update(meta, { create: true })
					meta.title = course[2]
					meta.subject = subjectID
					getCreateUpdate('courses', courseID, meta)

					// return to course listing page
					await tab.click("#DERIVED_SAA_CRS_RETURN_PB")
					await tab.whileVisible('#DERIVED_SAA_CRS_RETURN_PB',60000)
				}
			}
			// close the subject
			await tab.click("#"+subject[0])
			await tab.whileVisible('table.PSLEVEL2GRIDWBO, table.PSGROUPBOXWBO .PSTEXT',60000)
}
		}
	}
	}

}

;(startScrape)()
.then(() => {
	console.log("Job done!")
	nick.exit()
})
.catch((err) => {
	console.log(`Something went wrong: ${err}`)
	nick.exit(1)
})
