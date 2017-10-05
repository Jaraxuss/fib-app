const mq = require('mq');
const util = require('util');
const json = require('json');
const orm = require('fib-orm');
const err = require('./err');

function filter(obj, keys) {
    var obj1 = {};
    var v;

    keys.forEach(k => (v = obj[k]) !== undefined ? obj1[k] = v : undefined);
    return obj1;
}

function convert_where(where) {
    var where1 = {};
    var or = where["$or"];

    if (util.isArray(or)) {
        where1["or"] = or.map(o => convert_where(o));
        return where1;
    }

    for (var k in where) {
        var v = where[k];

        if (util.isArray(v))
            where1[k] = v;
        else if (util.isObject(v)) {
            const keys = Object.keys(v);
            if (keys.length >= 1) {
                var op = keys[0];

                if (op === "$eq")
                    where1[k] = orm.eq(v[op]);
                else if (op === "$ne")
                    where1[k] = orm.ne(v[op]);
                else if (op === "$gt")
                    where1[k] = orm.gt(v[op]);
                else if (op === "$gte")
                    where1[k] = orm.gte(v[op]);
                else if (op === "$lt")
                    where1[k] = orm.lt(v[op]);
                else if (op === "$lte")
                    where1[k] = orm.lte(v[op]);
                else if (op === "$between") {
                    var a = v[op];
                    if (util.isArray(a))
                        where1[k] = orm.between(a[0], a[1]);
                } else if (op === "$not_between") {
                    var a = v[op];
                    if (util.isArray(a))
                        where1[k] = orm.not_between(a[0], a[1]);
                } else if (op === "$like")
                    where1[k] = orm.like(v[op]);
                else if (op === "$not_like")
                    where1[k] = orm.not_like(v[op]);
                else if (op === "$in")
                    where1[k] = v[op];
                else if (op === "$not_in")
                    where1[k] = orm.not_in(v[op]);
            }
        } else
            where1[k] = v;
    }

    return where1;
}

module.exports = pool => {
    var api = new mq.Routing();

    api.post('/:classname', (req, classname) => {
        pool((db) => {
            const cls = db.models[classname];
            if (cls === undefined) {
                err.API(req, 103);
                return;
            }

            var data;
            var obj;

            try {
                data = req.json();
            } catch (e) {
                err.API(req, 107, e.message);
                return;
            }

            try {
                obj = cls.createSync(data);
            } catch (e) {
                err.API(req, 119, e.message);
                return;
            }

            err.API(req, 201);

            if (Array.isArray(obj)) {
                req.response.json(obj.map(o => {
                    return {
                        id: o.id
                    };
                }));
            } else
                req.response.json({
                    id: obj.id
                });
        });
    });

    api.get('/:classname/:id', (req, classname, id) => {
        pool((db) => {
            const cls = db.models[classname];
            if (cls === undefined) {
                err.API(req, 103);
                return;
            }

            var exec = cls.find({
                id: id
            });

            var keys = req.query.keys;
            if (keys !== undefined) {
                keys = keys.split(',');
                exec = exec.only(keys);
            }

            var obj;
            try {
                obj = exec.firstSync();
                if (obj === null) {
                    err.API(req, 101);
                    return;
                }
            } catch (e) {
                err.API(req, 101, e.message);
                return;
            }

            if (keys !== undefined)
                obj = filter(obj, keys);

            req.response.json(obj);
        });
    });

    api.put('/:classname/:id', (req, classname, id) => {
        pool((db) => {
            const cls = db.models[classname];
            if (cls === undefined) {
                err.API(req, 103);
                return;
            }

            var data;
            var obj;

            try {
                obj = cls.getSync(id);
            } catch (e) {
                err.API(req, 101, e.message);
                return;
            }

            try {
                data = req.json();
            } catch (e) {
                err.API(req, 107, e.message);
                return;
            }

            for (var k in data)
                obj[k] = data[k];
            obj.saveSync();

            req.response.json({
                id: obj.id
            });
        });
    });

    api.del('/:classname/:id', (req, classname, id) => {
        pool((db) => {
            const cls = db.models[classname];
            if (cls === undefined) {
                err.API(req, 103);
                return;
            }

            var obj;
            try {
                obj = cls.getSync(id);
            } catch (e) {
                err.API(req, 101, e.message);
                return;
            }

            obj.removeSync();

            req.response.json({
                id: obj.id
            });
        });
    });

    api.get('/:classname', (req, classname) => {
        pool((db) => {
            const cls = db.models[classname];
            if (cls === undefined) {
                err.API(req, 103);
                return;
            }

            var where = req.query.where;
            if (where !== undefined) {
                try {
                    where = json.decode(where);
                } catch (e) {
                    err.API(req, 107, e.message);
                    return;
                }

                where = convert_where(where);
            } else where = {};

            var exec = cls.find(where);

            var order = req.query.order;
            if (order !== undefined)
                exec = exec.order(order);

            var skip = req.query.skip;
            if (skip !== undefined) {
                skip = +skip;
                if (isNaN(skip) || skip < 0) {
                    err.API(req, 118);
                    return;
                }
                exec = exec.offset(skip);
            }

            var keys = req.query.keys;
            if (keys !== undefined) {
                keys = keys.split(',');
                exec = exec.only(keys);
            }

            var limit = +req.query.limit;
            if (isNaN(limit) || limit <= 0 || limit > 1000)
                limit = 100;

            var objs;
            try {
                objs = exec.limit(limit).allSync();
            } catch (e) {
                err.API(req, 119, e.message);
                return;
            }

            if (keys !== undefined)
                objs = objs.map(obj => filter(obj, keys));

            if (req.query.count === '1') {
                var cnt;
                try {
                    cnt = exec.countSync();
                } catch (e) {
                    err.API(req, 119, e.message);
                    return;
                }
                objs = {
                    results: objs,
                    count: cnt
                }
            }

            req.response.json(objs);
        });
    });

    return api;
};