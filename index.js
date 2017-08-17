const express = require('express');
const bodyParser = require('body-parser');
const hash = require('pbkdf2-password')();
const path = require('path');
const session = require('express-session');

/** База */
const Users = require('./db/users');
const Messages = require('./db/messages');
const Categories = require('./db/categories');

const app = express();


/** Шаблон */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));


/** Сесії */
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  resave: false, // don't save session if unmodified
  saveUninitialized: false, // don't create session until something stored
  secret: 'secret text for salt'
}));

app.use(function(req, res, next){
  let err = req.session.error;
  let msg = req.session.success;
  delete req.session.error;
  delete req.session.success;
  res.locals.message = '';
  if (err) res.locals.message = '<p class="msg error">' + err + '</p>';
  if (msg) res.locals.message = '<p class="msg success">' + msg + '</p>';
  next();
});


/** Автентифікація */
function authenticate(name, pass, fn) {
  let user = null;

  Users.findOne({name: name}, function (err, users) {
    if (err) return console.error(err);

    user = users;

    if (!user) return fn(new Error('This user is not defined'));

    hash({ password: pass, salt: user.salt }, function (err, pass, salt, hash) {
      if (err) return fn(err);
      if (hash == user.hash) return fn(null, user);
      fn(new Error('Invalid password'));
    });
  });
}


/** Головна сторінка */
app.get('/', function(req, res) {
  if (req.session.user) {
    res.locals.viewType = 'read';

    res.locals.categoryId = req.query.categoryId;
    req.session.categoryId = res.locals.categoryId;

    Categories.find(function (err, categories) {
      if (err) return console.error(err);

      if (categories.length) {

        if (req.query.categoryId) {
          Messages
            .find({categoryid: req.query.categoryId})
            .sort({data: -1})
            .exec(function (err, messages) {
              if (err) return console.error(err);

              if (messages.length) {
                res.render('main', {categories: categories, messages: messages});
              } else {
                req.session.error = 'Don`t messages in this category';
                res.redirect('/');
              }
            });
        } else {
          res.render('main', {categories: categories});
        }

      } else {
        req.session.error = 'Don`t categories for select';
        res.redirect('/add');
      }
    });
  } else {
    req.session.error = 'Access denied!';
    res.redirect('/login');
  }
});


/** Виведення записів */
app.post('/read', function(req, res) {
  res.redirect('/?categoryId=' + req.body.categoryid);
});


/** Додавання запису */
app.route('/write')
  .get(function(req, res) {
    if (req.session.user) {
      res.locals.viewType = 'write';

      res.locals.categoryId = req.session.categoryId;

      Categories.find(function (err, categories) {
        if (err) return console.error(err);

        if (categories.length) {
          res.render('main', {categories: categories});
        } else {
          req.session.error = 'Don`t categories for select';
          res.redirect('/add');
        }
      });
    } else {
      req.session.error = 'Access denied!';
      res.redirect('/login');
    }
  })
  .post(function(req, res) {
    let newMessage = {
      categoryid: req.body.categoryid,
      text: req.body.message,
      data: Date.now()
    };

    let message = new Messages(newMessage);

    message.save(function (err, message) {
      if (message) {
        req.session.success = 'Added message';

        res.redirect('/?categoryId=' + message.categoryid);
      } else {
        req.session.error = 'Please, write message and try again';
        res.redirect('/write');
      }
    });
  });


/** Додавання категорії */
app.route('/add')
  .get(function(req, res) {
    if (req.session.user) {
      res.locals.viewType = 'add';

      res.locals.categoryId = req.session.categoryId;

      res.render('main');
    } else {
      req.session.error = 'Access denied!';
      res.redirect('/login');
    }
  })
  .post(function(req, res) {
    let newCategory = {
      name: req.body.categoryname
    };

    let category = new Categories(newCategory);

    category.save(function (err, category) {
      if (category) {
        req.session.success = 'Added category ' + category.name;

        res.redirect('/?categoryId=' + category.categoryid);
      } else {
        req.session.error = 'Please, write category and try again';
        res.redirect('/add');
      }
    });
  });


/** Авторизація */
app.get('/login', function(req, res) {
  res.render('login');
});

app.post('/login', function(req, res) {
  authenticate(req.body.username, req.body.password, function(err, user){
    if (user) {
      req.session.user = user;

      req.session.success = 'Hello ' + user.name;

      res.redirect('/');
    } else {
      req.session.error = err.message;
      res.redirect('/login');
    }
  });
});


/** Реєстрація */
app.get('/register', function(req, res) {
  res.render('register');
});

app.post('/register', function(req, res) {
  let newUser = {
    name: req.body.username
  };

  hash({ password: req.body.password }, function (err, pass, salt, hash) {
    if (err) throw err;

    newUser.salt = salt;
    newUser.hash = hash;

    let user = new Users(newUser);

    user.save(function (err, user) {
      if (user) {
        req.session.user = user;

        req.session.success = 'Hello ' + user.name;

        res.redirect('/');
      } else {
        req.session.error = 'This name is already used, please try with another';
        res.redirect('/register');
      }
    });
  });
});


/** Вихід */
app.get('/logout', function(req, res) {
  req.session.destroy(function(){
    res.redirect('/login');
  });
});


if (!module.parent) {
  app.listen(3000);
  console.log('Express started on port 3000');
}