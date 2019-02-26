const fetch = require("node-fetch");
const cheerio = require('cheerio');
const camelCase = require('lodash.camelcase');
const Bottleneck = require("bottleneck");

// Setup a Bottleneck for limiting fetches to SIS Mobile (be kind)
const limiter = new Bottleneck({
  maxConcurrent: 3,
  minTime: 333
});
const limitedFetch = limiter.wrap(fetch);

var cached = {};

function getCourseDetails($,career,subjectIndex,subject,id){
  var course = {
    id: id,
    title: $('div.strong.section-body').first().text(),
    description: $('div.section-content > div.section-body:nth-child(2)').first().text(),
    career: career,
    subjectIndex: subjectIndex,
    subject: subject,
  }
  $('body > section > section > div.section-content.clearfix')
      .each((i,elem)=>{
        course[camelCase( $(elem).find('div.pull-left > div.strong').first().text() )] = $(elem).find('div.pull-right > div').first().text();
      });
  // get terms for course
  return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/courseTerms/UVA01/"+id+"/1", {timeout:0})
    .then( res => res.text()
      .then( body => {
        const $$ = cheerio.load(body);
        const pageTitle = $$('.page-title').text();
        if (pageTitle == "Course Sections") {
          course.terms = [{id:res.url.replace(/.*\/(.*)/,"$1")}];
        } else {
          var terms = $$("section.main > section > a");
          if (terms.length > 0) {
            course.terms = [];
            terms.each((i,elem)=>{
              course.terms.push({
                id: $$(elem).attr('href').replace(/^.*\//,""),
                title: $$(elem).find('div.section-body').first().text()
              });
            });
          }
        }
        return [course];
      })
    );
}

module.exports = {
  getCareers: function(){
    if (cached)
      return Promise.resolve(cached);
    else {
      console.log('* fetch careers')
      return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/listCatalogCareers", {timeout:0})
        .then( res => res.text() )
        .then( body => {
          const $ = cheerio.load(body);
          cached = $('body > section > section > a')
            .map( (i, elem)=>{
              var cars = {
                link: $(elem).attr('href'),
                title: $(elem).find('div > div').text()
              };
              cars.id = cars.link.replace(/.*\//,'');
              return cars;
            } ).get();
          return cached;
        } );
    }
  },

  getSubjectIndex: function(careerId){
    if (careerId) {
      console.log('** fetch subject index '+careerId)
      return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/listCatalog/UVA01/"+careerId, {timeout:0})
        .then( res => res.text() )
        .then( body => {
          const $ = cheerio.load(body);
          return $('body > section > section > div[id] > a')
            .map( (i, elem)=>{
              var sub = {
                link: $(elem).attr('href'),
                career: careerId,
                id: $(elem).find("div > div[class='pull-left'] > div").text(),
                subjectRangeSnip: $(elem).find("div > div[class='pull-right'] > div").text()
              };
              return sub;
            } ).get();
        } );
    } else {
      return this.getCareers().then( careers=>{
        return Promise.all( careers.map(career=>{ return this.getSubjectIndex(career.id) }) )
          .then( indexes=>{ return [].concat.apply([], indexes) } );
      } );
    }
  },

  getSubjects: function(career, subjectIndex){
      if (subjectIndex && career) {
        console.log('*** fetch subjects '+career+' '+subjectIndex)
        return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/listSubjectsByLetter/UVA01/"+subjectIndex+"/"+career, {timeout:0})
          .then( res => res.text() )
          .then( body => {
            const $ = cheerio.load(body);
            return $('body > section > section > div[id] > a')
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
          } );
      } else {
        return this.getSubjectIndex(career).then( indexes=>{
          return Promise.all( indexes.map(subjectIndex=>{ return this.getSubjects(subjectIndex.career,subjectIndex.id) }) )
            .then( subjects=>{ return [].concat.apply([], subjects) } );
        } );
      }
  },

  getCourses: function(career, subjectIndex, subject){
    if (career && subjectIndex && subject) {
      console.log('**** fetch courses '+career+' '+subjectIndex+' '+subject)
      return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/listCoursesBySubject/UVA01/"+subjectIndex+"/"+subject+"/"+career, {timeout:0})
        .then( res => res.text()
          .then( body => {
            const $ = cheerio.load(body);
            const pageTitle = $('.page-title').text();
            return (pageTitle == "Course Details")?
              getCourseDetails($,career,subjectIndex,subject,res.url.replace(/.*\//,"") ):
              $('section.main > section > div > a')
                .map( (i, elem)=>{
                  return {
                    career: career,
                    subjectIndex: subjectIndex,
                    subject: subject,
                    id: $(elem).attr('href').replace(/.+\/(.+)\/.+\/.*/,"$1"),
                    title: $(elem).find('div.strong.section-body').last().text(),
                    link: $(elem).attr('href')
                  };
                } ).get();
            } )
        );
    } else {
      return this.getSubjects(career,subjectIndex).then( subjects=>{
        return Promise.all( subjects.map(subject=>{ return this.getCourses(subject.career,subject.subjectIndex,subject.id) }) )
          .then( courses=>{ return [].concat.apply([], courses) } );
      } );
    }
  },

  getCourse: function(courseId, career, subjectIndex, subject){
    if (courseId) {
      console.log('**** fetch course '+courseId+' '+career+" "+subjectIndex+' '+subject)
      return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/showCourse/UVA01/"+courseId, {timeout:0})
        .then( res => res.text() )
        .then( body => {
          const $ = cheerio.load(body);
          return getCourseDetails($,career,subjectIndex,subject,courseId);
        } )
    } else {
      return this.getCourses(career,subjectIndex,subject).then( courses=>{
        return Promise.all( courses.map(course=>{ return this.getCourse(course.id,course.career,course.subjectIndex,course.subject) }) )
          .then( course=>{ return [].concat.apply([], course) } );
      } );
    }
  },

  getSections: function(termId, courseId, career, subjectIndex, subject){
    if (termId) {
      console.log('**** fetch sections for term:'+termId+' and course:'+courseId);
      return limitedFetch("https://msisuva.admin.virginia.edu/app/catalog/coursesections/UVA01/"+courseId+"/1/"+termId, {timeout:0})
        .then( res => res.text() )
        .then( body => {
          const $ = cheerio.load(body);
//          const pageTitle = $('.page-title').text();
//          return (pageTitle == "Course Details")?
//            getCourseDetails($,career,subjectIndex,subject,res.url.replace(/.*\//,"") ):
//            $('section.main > section > div > a')
//              .map( (i, elem)=>{
//                return {
//                  career: career,
//                  subjectIndex: subjectIndex,
//                  subject: subject,
//                  id: $(elem).attr('href').replace(/.+\/(.+)\/.+\/.*/,"$1"),
//                  title: $(elem).find('div.strong.section-body').last().text(),
//                  link: $(elem).attr('href')
//                };
//              } ).get();
        } )
    } else {
      return Promise.resolve([]);
//      return this.getCourses(career,subjectIndex,subject).then( courses=>{
//        return Promise.all( courses.map(course=>{ return this.getCourse(course.id,course.career,course.subjectIndex,course.subject) }) )
//          .then( course=>{ return [].concat.apply([], course) } );
//      } );
    }
  }

}
