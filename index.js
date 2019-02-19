const fetch = require("node-fetch");
const cheerio = require('cheerio');
const camelCase = require('lodash.camelcase');

var cachedCareers = null;

function getCourseDetails($){
  var course = {
    id: $('div.button-wrapper > a').first().attr('href').replace(/.*\/(.*)\/.*/,"$1"),
    title: $('div.strong.section-body').first().text(),
    description: $('div.section-content > div.section-body:nth-child(2)').first().text()
  }
  $('body > section > section > div.section-content.clearfix')
      .each((i,elem)=>{
        course[camelCase( $(elem).find('div.pull-left > div.strong').first().text() )] = $(elem).find('div.pull-right > div').first().text();
      })
  return course;
}

module.exports = {
  getCareers: ()=>{
    if (cachedCareers)
      return Promise.resolve(cachedCareers);
    else {
      console.log('* careers fetch')
      return fetch("https://msisuva.admin.virginia.edu/app/catalog/listCatalogCareers", {timeout:0})
        .then( res => res.text() )
        .then( body => {
          const $ = cheerio.load(body);
          cachedCareers = $('body > section > section > a')
            .map( (i, elem)=>{
              var cars = {
                link: $(elem).attr('href'),
                title: $(elem).find('div > div').text()
              };
              cars.id = cars.link.replace(/.*\//,'');
              return cars;
            } ).get();
          return cachedCareers;
        } );
    }
  },

  getSubjectIndex: careerId=>{
    if (careerId) {
      console.log('** subject index fetch '+careerId)
      return fetch("https://msisuva.admin.virginia.edu/app/catalog/listCatalog/UVA01/"+careerId, {timeout:0})
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

  getSubjects: (career, subjectIndex)=>{
      if (subjectIndex && career) {
        console.log('*** subjects '+career+' '+subjectIndex)
        return fetch("https://msisuva.admin.virginia.edu/app/catalog/listSubjectsByLetter/UVA01/"+subjectIndex+"/"+career, {timeout:0})
          .then( res => res.text() )
          .then( body => {
            const $ = cheerio.load(body);
            return $('body > section > section > div[id] > a')
              .map( (i, elem)=>{
                var sub = {
                  link: $(elem).attr('href'),
                  display: $(elem).find('div > div').text(),
                  career: career
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

  getCourses: (career, subjectIndex, subject)=>{
    if (career && subjectIndex && subject) {
      console.log('**** courses '+career+' '+subjectIndex+' '+subject)
      return fetch("https://msisuva.admin.virginia.edu/app/catalog/listCoursesBySubject/UVA01/"+subjectIndex+"/"+subject+"/"+career, {timeout:0})
        .then( res => res.text() )
        .then( body => {
          const $ = cheerio.load(body);
          const pageTitle = $('.page-title').text();
          return (pageTitle)?
            Promise.resolve( [getCourseDetails($)] ):
            null
          // if one item we get the item page
//          return $('body > section > section > div[id] > a')
//            .map( (i, elem)=>{
//              var sub = {
//                link: $(elem).attr('href'),
//                display: $(elem).find('div > div').text(),
//                career: career
//              };
//              [sub.id, sub.title] = sub.display.split(' - ');
//              return sub;
//            } ).get();
        } );
    } else {

    }
  }

}
