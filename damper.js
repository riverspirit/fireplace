var fs = require('fs');
var http = require('http');
var path = require('path');

// Here's the local server.
var indexdata = 'Still loading...';
fs.readFile('./hearth/index.html', function(err, data) {
    indexdata = data;
});

var mimes = {
    'css': 'text/css',
    'js': 'application/javascript',
    'woff': 'application/font-woff'
};

var options = function(opts, defaults) {
    var out = defaults || {},
              last, i, is_flag;
    for(i = 0; i < opts.length; i++) {
        is_flag = opts[i].substr(0, 1) === '-';
        if (is_flag && last) {
            out[last] = true;
        } else if (!is_flag && last) {
            while(last.substr(0, 1) === '-'){
                last = last.substr(1);
            }
            out[last] = opts[i];
        }
        last = is_flag ? opts[i] : null;
    }
    return out;
};

var opts = options(process.argv.slice(2), {'host': '0.0.0.0', 'port': '8675'});

http.createServer(function(request, response) {

    var now = new Date();

    console.log(
        '[' + now.getHours() + ':' + now.getMinutes() + ':' + now.getSeconds() + '] ' +
        request.url);

    function writeIndex() {
        fs.readFile('./hearth/index.html', function(error, content) {
            // We'll assume that you don't delete index.html.
            response.writeHead(200, {'Content-Type': 'text/html'});
            response.end(content, 'utf-8');
        });
    }

    if(request.url == '/')
        return writeIndex();

    var filePath = './hearth' + request.url;
    fs.exists(filePath, function(exists) {
        if (exists) {
            fs.readFile(filePath, function(error, content) {
                if (error) {
                    response.writeHead(500);
                    response.end();
                    console.error(error);
                }
                else {
                    var dot = request.url.lastIndexOf('.');
                    if (dot > -1) {
                        var extension = request.url.substr(dot + 1);
                        response.writeHead(200, {'Content-Type': mimes[extension]});
                    }

                    response.end(content, 'utf-8');
                }
            });
        } else {
            writeIndex();
        }
    });

}).listen(opts.port, opts.host);

console.log('Server running at http://' + opts.host + ':' + opts.port);

var child_process = require('child_process'),
    watched_filepaths = [];

function glob(path, ext, done) {
    var results = [];
    fs.readdir(path, function(err, list) {
        if (err) return done(err);
        var pending = list.length;
        if (!pending) return done(null, results);
        list.forEach(function(file) {
            file = path + '/' + file;
            fs.stat(file, function(err, stat) {
                if (stat && stat.isDirectory()) {
                    glob(file, ext, function(err, res) {
                        results = results.concat(res);
                        if (!--pending) done(null, results);
                    });
                } else {
                    // If it's got the right extension, add it to the list.
                    if(file.substr(file.length - ext.length) == ext)
                        results.push(file);
                    if (!--pending) done(null, results);
                }
            });
        });
    });
}


function reload() {
    watched_filepaths.forEach(function(filepath) {
        fs.unwatchFile(filepath);
    });
    watched_filepaths = [];

    // "restart" is a special action keyword
    watch('./damper.js', null, 'restart');
    watch('./compile_templates.js', null, 'nunjucks');

    watch('./hearth/media/css', 'less', 'less');
    watch('./hearth/templates', 'html', 'nunjucks');

    // When the builder is updated, recompile the templates.
    watch('./hearth/js/builder.js', null, 'nunjucks');
}

function compileNunjucks() {
    child_process.exec('./compile_templates.js ./hearth/templates > hearth/templates.js', function(e, so, se) {
        console.log(se);  // stderr
        if (e !== null) {
            console.error(e);
        }
    });
}

function runCommand(command, filepath) {
    switch (command) {
        case 'restart':
            console.log('Restarting...');
            return reload();
        case 'less':
            child_process.exec('lessc ' + filepath + ' ' + filepath + '.css', function(e, so, se) {
                if (e !== null) {
                    console.error(e);
                }
            });
            break;
        case 'nunjucks':
            console.log('Recompiling templates...');
            compileNunjucks();
            break;
    }
}

function watch(globpath, ext, command) {
    var cb = function(err, filepaths) {
        // for single files, filepaths will just be one file: the exact match
        filepaths.forEach(function(filepath) {
            // save the filepath so that we can unwatch it easily when reloading, and start the watch
            watched_filepaths.push(filepath);
            if (command == 'less') {
                fs.exists(filepath, function(exists) {
                    if (exists) {
                        runCommand(command, filepath);
                    }
                });
            }
            fs.watchFile(filepath, {interval: 250}, function(curr, prev) {
                // ignore simple accesses
                if (curr.mtime.valueOf() != prev.mtime.valueOf() || curr.ctime.valueOf() != prev.ctime.valueOf()) {
                    console.warn('> ' + filepath + ' changed.');
                    runCommand(command, filepath);
                }
            });

        });
        if (filepaths.length > 1)
            console.log('Watching ' + filepaths.length + ' ' + ext + ' files.');
    };
    if (globpath.substr(1).indexOf('.') > -1) {
        cb(null, [globpath]);
    } else {
        glob(globpath, ext, cb);
    }
}

compileNunjucks();
reload();
