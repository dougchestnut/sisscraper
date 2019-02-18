const fetch = require("node-fetch");
const cheerio = require('cheerio');
var cachedCareers = null;

module.exports = {
  getCareers: function(){
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

  getSubjectIndex: function(careerId){
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

  getSubjects: function(career, subjectIndex){
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
  }

}
