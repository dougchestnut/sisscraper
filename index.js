const fetch = require("node-fetch");
const cheerio = require('cheerio');
const camelCase = require('lodash.camelcase');
const Bottleneck = require("bottleneck");

// Setup a Bottleneck for limiting fetches to SIS Mobile (be kind)
const limiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 333
});

const fetch_retry = (url, options, n) => fetch(url, options).catch(function(error) {
    if (n === 1) throw error;
    return fetch_retry(url, options, n - 1);
});

const limitedFetch = limiter.wrap(fetch_retry);

var cached = {};

function getTermsDetails(courseId){
  // get terms for course
  if (cached.termsDetails && cached.termsDetails[courseId]) {
    console.log('hit cache for terms details!!!!!!!!!!!!!!!!!!!!!')
    return Promise.resolve(cached.termsDetails[courseId]);
  } else {
    if (!cached.termsDetails) cached.termsDetails = {};
    return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/courseTerms/UVA01/"+courseId+"/1", {timeout:0}, 10)
      .then( res => res.text()
        .then( body => {
          const $$ = cheerio.load(body);
          const pageTitle = $$('.page-title').text();
          if (pageTitle == "Course Sections") {
            cached.termsDetails[courseId] = [{id:res.url.replace(/.*\/(.*)/,"$1")}];
          } else {
            const terms = $$("section.main > section > a").get();
            cached.termsDetails[courseId] = terms.map(elem=>{
                return {
                  id: $$(elem).attr('href').replace(/^.*\//,""),
                  title: $$(elem).find('div.section-body').first().text()
                };
            });
          }
          return cached.termsDetails[courseId];
        })
      );
  }
}

function getCourseDetails($,career,subjectIndex,subject,id){
  var course = {
    id: id,
    title: $('div.strong.section-body').first().text(),
    description: $('div.section-content > div.section-body:nth-child(2)').first().text(),
    career: career,
    subjectIndex: subjectIndex,
    subject: (Array.isArray(subject))?subject:[subject],
  }
  $('body > section > section > div.section-content.clearfix')
      .each((i,elem)=>{
        course[camelCase( $(elem).find('div.pull-left > div.strong').first().text() )] = $(elem).find('div.pull-right > div').first().text();
      });
  return getTermsDetails(id).then(terms=>{
    course.terms = terms;
    return [course];
  });
}

module.exports = {

  importHistoryFromLou: function(termId, courseId){
    return limitedFetch("https://rabi.phys.virginia.edu/mySIS/CS2/enrollmentData.php?Semester="+termId+"&ClassNumber="+courseId,{timeout:0}, 10)
      .then( res => res.json() )
  },

  getCareers: function(){
    if (cached.careers) {
      console.log('hit cache for careers!!!!!!!!!!!!!!!!!!!!!!')
      return Promise.resolve(cached.careers);
    } else {
      console.log('* fetch careers')
      return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/listCatalogCareers", {timeout:0}, 10)
        .then( res => res.text() )
        .then( body => {
          const $ = cheerio.load(body);
          cached.careers = $('body > section > section > a')
            .map( (i, elem)=>{
              var cars = {
                link: $(elem).attr('href'),
                title: $(elem).find('div > div').text()
              };
              cars.id = cars.link.replace(/.*\//,'');
              return cars;
            } ).get();
          return cached.careers;
        } );
    }
  },

  getSubjectIndex: function(careerId){
    if (careerId) {
      if (cached.subjectIndex && cached.subjectIndex[careerId]) {
        console.log("hit cache for subject index!!!!!!!!!!!!!!!!!!!!!!");
        return Promise.resolve(cached.subjectIndex[careerId]);
      } else {
        console.log('** fetch subject index '+careerId)
        return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/listCatalog/UVA01/"+careerId, {timeout:0}, 10)
          .then( res => res.text() )
          .then( body => {
            const $ = cheerio.load(body);
            if (!cached.subjectIndex) cached.subjectIndex = {};
            cached.subjectIndex[careerId] = $('body > section > section > div[id] > a')
              .map( (i, elem)=>{
                var sub = {
                  link: $(elem).attr('href'),
                  career: careerId,
                  id: $(elem).find("div > div[class='pull-left'] > div").text(),
                  subjectRangeSnip: $(elem).find("div > div[class='pull-right'] > div").text()
                };
                return sub;
              } ).get();
            return cached.subjectIndex[careerId];
          } );
      }
    } else {
      return this.getCareers().then( careers=>{
        return Promise.all( careers.map(career=>{ return this.getSubjectIndex(career.id) }) )
          .then( indexes=>{ return [].concat.apply([], indexes) } );
      } );
    }
  },

  getSubjects: function(career, subjectIndex){
      if (subjectIndex && career) {
        if (cached.subjects && cached.subjects[career+'-'+subjectIndex]) {
          console.log("hit cache for subjects!!!!!!!!!!!!!!!!!!!!!!!!");
          return Promise.resolve(cached.subjects[career+'-'+subjectIndex]);
        } else {
          if (!cached.subjects) cached.subjects = {};
          console.log('*** fetch subjects '+career+' '+subjectIndex)
          return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/listSubjectsByLetter/UVA01/"+subjectIndex+"/"+career, {timeout:0}, 10)
            .then( res => res.text() )
            .then( body => {
              const $ = cheerio.load(body);
              cached.subjects[career+'-'+subjectIndex] = $('body > section > section > div[id] > a')
                .map( (i, elem)=>{
                  var sub = {
                    link: $(elem).attr('href'),
                    display: $(elem).find('div > div').text(),
                    career: career,
                    subjectIndex: subjectIndex
                  };
                  [sub.id, sub.title] = sub.display.split(' - ');
                  return sub;
                } ).get();
              return cached.subjects[career+'-'+subjectIndex];
            } );
          }
      } else {
        return this.getSubjectIndex(career).then( indexes=>{
          return Promise.all( indexes.map(subjectIndex=>{ return this.getSubjects(subjectIndex.career,subjectIndex.id) }) )
            .then( subjects=>{ return [].concat.apply([], subjects) } );
        } );
      }
  },

  getCourses: function(career, subjectIndex, subject){
    if (career && subjectIndex && subject) {
      if (cached.courses && cached.courses[career+'-'+subjectIndex+'-'+subject]) {
        console.log('hit cache for cached courses!!!!!!!!!!!!!!!!!!!!!!!!!!');
        return Promise.resolve(cached.courses[career+'-'+subjectIndex+'-'+subject]);
      } else {
        if (!cached.courses) cached.courses = {};
        console.log('**** fetch courses '+career+' '+subjectIndex+' '+subject)
        return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/listCoursesBySubject/UVA01/"+subjectIndex+"/"+subject+"/"+career, {timeout:0}, 10)
          .then( res => res.text()
            .then( body => {
              const $ = cheerio.load(body);
              const pageTitle = $('.page-title').text();
              cached.courses[career+'-'+subjectIndex+'-'+subject] = (pageTitle == "Course Details")?
                getCourseDetails($,career,subjectIndex,subject,res.url.replace(/.*\//,"") ):
                $('section.main > section > div > a')
                  .map( (i, elem)=>{
                    return {
                      career: career,
                      subjectIndex: subjectIndex,
                      subject: (Array.isArray(subject))?subject:[subject],
                      id: $(elem).attr('href').replace(/.+\/(.+)\/.+\/.*/,"$1"),
                      course: [$(elem).find('div.strong.section-body').last().text()],
                      link: $(elem).attr('href')
                    };
                  } ).get();
              return cached.courses[career+'-'+subjectIndex+'-'+subject];
              } )
          );
      }
    } else {
      return this.getSubjects(career,subjectIndex).then( subjects=>{
        return Promise.all( subjects.map(subject=>{ return this.getCourses(subject.career,subject.subjectIndex,subject.id) }) )
          .then( courses=>{ return [].concat.apply([], courses) } );
      } );
    }
  },

  getCourse: function(courseId, career, subjectIndex, subject){
    if (courseId) {
      if (cached.course && cached.course[courseId+'-'+career+'-'+subjectIndex+'-'+subject]) {
        console.log('hit cache for cached course!!!!!!!!!!!!!!!!!!!!!!!!');
        return Promise.resolve(cached.course[courseId+'-'+career+'-'+subjectIndex+'-'+subject]);
      } else {
        if (!cached.course) cached.course = {};
        console.log('**** fetch course '+courseId+' '+career+" "+subjectIndex+' '+subject)
        return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/showCourse/UVA01/"+courseId, {timeout:0}, 10)
          .then( res => res.text() )
          .then( body => {
            const $ = cheerio.load(body);
            cached.course[courseId+'-'+career+'-'+subjectIndex+'-'+subject] = getCourseDetails($,career,subjectIndex,subject,courseId);
            return cached.course[courseId+'-'+career+'-'+subjectIndex+'-'+subject];
          } )
      }
    } else {
      return this.getCourses(career,subjectIndex,subject).then( courses=>{
        return Promise.all( courses.map(course=>{ return this.getCourse(course.id,course.career,course.subjectIndex,course.subject) }) )
          .then( course=>{ return [].concat.apply([], course) } );
      } );
    }
  },

  // getCourse already gets terms so this isn't that usefull
  getTerms: function(courseId, career, subjectIndex, subject){
    if (courseId) {
      console.log('**** fetch terms for course '+courseId+' '+career+" "+subjectIndex+' '+subject)
      return getTermsDetails(courseId);
    } else {
      return this.getCourses(career,subjectIndex,subject).then( courses=>{
        return Promise.all( courses.map(course=>{ return this.getTerms(course.id) }) )
          .then( term=>{
            var terms = [].concat.apply([], term);
            return terms;
          } );
      } )
    }
  },

  getSections: function(termId, courseId, career, subjectIndex, subject){
    if (termId && courseId) {
      if (cached.sections && cached.sections[termId+'-'+courseId+'-'+career+'-'+subjectIndex+'-'+subject]) {
        console.log('hit cache for sections!!!!!!!!!!!!!!!!!!!!!!!!!!');
        return Promise.resolve(cached.sections[termId+'-'+courseId+'-'+career+'-'+subjectIndex+'-'+subject]);
      } else {
        if (!cached.sections) cached.sections = {};
        console.log('**** fetch sections for term:'+termId+' and course:'+courseId);
        return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/coursesections/UVA01/"+courseId+"/1/"+termId, {timeout:0}, 10)
          .then( res => res.text() )
          .then( body => {
            const $ = cheerio.load(body);
            cached.sections[termId+'-'+courseId+'-'+career+'-'+subjectIndex+'-'+subject] = $('div#course-sections > a')
                .map( (i, elem)=>{
                  return {
                      termId: termId,
                      courseId: courseId,
                      career: career,
                      subjectIndex: subjectIndex,
                      subject: (Array.isArray(subject))?subject:[subject],
                      secitionId: $(elem).attr('href').replace(/.+\//,""),
                      course: $(elem).find('div.strong.section-body').last().text().replace(/\s+\(.+\)$/,""),
                      link: $(elem).attr('href'),
                      id: $(elem).attr('href').replace(/.+\//,"")+"-"+termId
                  };
                } ).get();
            return cached.sections[termId+'-'+courseId+'-'+career+'-'+subjectIndex+'-'+subject];
          } )
      }
    } else {
      return this.getCourse(courseId, career, subjectIndex, subject)
        .then( courses=>{
          // return array of all course term combos
          var combos = [];
          courses.forEach( course=>{
            course.terms.forEach( term=>{
              combos.push([term.id,course.id]);
            });
          } )
          return combos;
        } )
        .then( combos=>{
          return Promise.all( combos.map(combo=>{ return this.getSections(combo[0], combo[1], career, subjectIndex, subject) }) )
            .then( session=>{ return [].concat.apply([], session) } );
        } );
    }
  },

  getSection: function(sectionId, termId, courseId, career, subjectIndex, subject){
    if (sectionId && termId) {
      if (sectionId.indexOf('-')>-1) sectionId = sectionId.replace(/(.+)\-.*/,"$1");
      if (cached.section && cached.section[sectionId+'-'+termId+'-'+courseId+'-'+career+'-'+subjectIndex+'-'+subject]) {
        console.log('hit cache for section!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        return Promise.resolve(cached.section[sectionId+'-'+termId+'-'+courseId+'-'+career+'-'+subjectIndex+'-'+subject]);
      } else {
        if (!cached.section) cached.section = {};
        console.log('**** fetch section details for section:'+sectionId+' term:'+termId);
        return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/classsection/UVA01/"+termId+"/"+sectionId, {timeout:0}, 10)
          .then( res => res.text() )
          .then( body => {
            const $ = cheerio.load(body);
            var section = {
              id: (sectionId.indexOf('-')>-1)? sectionId: sectionId+"-"+termId,
              sectionId: sectionId,
              termId: termId,
              courseId: courseId,
              career: career,
              subjectIndex: subjectIndex,
              subject: (Array.isArray(subject))? subject:[subject],
              number: $("h1.page-title").last().text().replace(/.+\- /,""),
              course: $("h1.page-title").last().text().replace(/ -.+/,""),
              title: $("div.primary-head").first().text().replace(/\s+(.+?) \s+/s, "$1"),
            };
            $('body > section > section > div.section-content.clearfix')
                .each((i,elem)=>{
                  section[camelCase( $(elem).find('div.pull-left > div.strong').first().text() )] = $(elem).find('div.pull-right > div').first().text();
                });
            cached.section[sectionId+'-'+termId+'-'+courseId+'-'+career+'-'+subjectIndex+'-'+subject] = [section];
            return cached.section[sectionId+'-'+termId+'-'+courseId+'-'+career+'-'+subjectIndex+'-'+subject];
          } )
      }
    } else {
      return this.getSections(termId, courseId, career, subjectIndex, subject)
        .then( sections=>{
          return Promise.all( sections.map(section=>{ return this.getSection(section.id, section.termId, courseId, career, subjectIndex, subject) }) )
            .then( session=>{ return [].concat.apply([], session) } );
        } );
    }
  }

}
