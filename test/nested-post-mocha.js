var mmongoose = require('mongoose'),
    Schema = mmongoose.Schema,
    objectId = mmongoose.Schema.ObjectId,
    express = require('express'),

    rest = require('../index'),
    request = require('./support/http'),
    mongoose = require('mongoose'),
    should = require('should'),
    Schema = mongoose.Schema,
    json = JSON.stringify,
    compat = require('../lib/compat'),
    app = express(),
    Promise = require('mongoose/node_modules/mpromise'),
    promise = function(){
        return new Promise();
    };

var EmployeeSchema = new Schema({
    firstname: {
        type: String,
        required: true,
        trim: true
    }});
var GroupSchema = new Schema();

GroupSchema.add({
    name:String,
    employees:[{type: Schema.Types.ObjectId, ref:'Employee'}],
    owner:{type: Schema.Types.ObjectId, ref:'Employee'},
    groups:[GroupSchema]
})

var DepartmentSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        index: {
            unique: true
        }
    },
    employees: [EmployeeSchema]
});
DepartmentSchema.methods.hello = function DepartmentSchema$hello(){
    return {name:'hello '+this.name};
}
DepartmentSchema.methods.promises = function DepartmentSchema$hello(data){
    var p = promise();
    setTimeout(p.resolve.bind(p, null, {name:'hello '+this.name}), 100);
    return p;
}
DepartmentSchema.methods.superDo = function DepartmentSchema$hello(data){
   return Department.find({
       _id:this._id
   });
}

var mongoose = mmongoose.createConnection();
var Employee = mongoose.model('Employee', EmployeeSchema), Department = mongoose.model('Department', DepartmentSchema), Group = mongoose.model('Group', GroupSchema), d1;

app.use(compat.bodyParser());
app.use('/rest', rest({ mongoose: mongoose }).rest())
var connected = false, _id = mongoose.base.Types.ObjectId();
function insert(done) {
    new Department({_id:_id, name: 'HR', employees: [new Employee({firstname: 'John'}), new Employee({firstname: 'Bob'})]}).save(function (e, o) {
        d1 = o;

        done();
    });
}

before(function NestedPostTest$onBefore(done) {
    console.log('nested-post onBefore');
    mongoose.on('connected', function(){
        mongoose.db.dropDatabase(function(){
            insert(done);
        })
    });
    mongoose.open('mongodb://localhost/nested_post_test')
});

describe('testing nested', function () {
    it('should post', function (done) {
        console.log('finding ' + d1._id);
        request(app)
            .post('/rest/Department/' + d1._id + '/employees')
            .set('Content-Type', 'application/json')
            .send(json({"firstname": "Richard"})).expect(200).end(function (err, res) {
                console.log('response', err, res);
                res.body.should.have.property('status', 0);
                var payload = res.body.should.have.property('payload').obj;
                payload.should.have.property('firstname', 'Richard');
                payload.should.have.property('_id');
                done();
            })
    })
    it ('should invoke a method', function(done){
        request(app)
            .get('/rest/Department/' + _id + '/hello')
            .set('Content-Type', 'application/json')
            .send(json({"firstname": "Richard"})).expect(200).end(function (err, res) {
                console.log('response', err, res);
                res.body.should.have.property('status', 0);
                var payload = res.body.should.have.property('payload').obj;
                payload[0].should.have.property('name', 'hello HR');

                done();
            })
    })
    it('should invoke a method that returns a promise', function(done){
        request(app)
            .get('/rest/Department/' + _id + '/promises')
            .set('Content-Type', 'application/json')
            .send(json({"firstname": "Richard"})).expect(200).end(function (err, res) {
                console.log('response', err, res);
                res.body.should.have.property('status', 0);
                var payload = res.body.should.have.property('payload').obj;
                payload[0].should.have.property('name', 'hello HR');

                done();
            })
    });
    it('should invoke a method that returns an exec', function(done){
        request(app)
            .get('/rest/Department/' + _id + '/superDo')
            .set('Content-Type', 'application/json')
            .send(json({"firstname": "Richard"})).expect(200).end(function (err, res) {
                console.log('response', err, res);
                res.body.should.have.property('status', 0);
                var payload = res.body.should.have.property('payload').obj;
                payload[0].should.have.property('name', 'HR');

                done();
            })
    });
    it('should post nested objects', function(done){
        request(app).post('/rest/Group').set('Content-Type', 'application/json')
            .send(json({'name':'test', employees:[{firstname:'John'}, {firstname:'Suzy'}]}))
            .end(function(err, res){
              console.log(res);
               done();
            });
    });
    it('should error well', function(done){
        request(app).get('/rest/Department/'+d1._id).expect(200).end(function(err,res){
           request(app).post('/rest/Department')
               .set('Content-Type', 'application/json')
               .send(json(res.body.payload))
               .expect(200)
               .end(function(err,resp){
                   resp.body.should.have.property('error');
                   resp.body.should.not.have.property('payload');
                   resp.body.should.have.property('status', 1);
                   done();
               });
        });
    })
});
