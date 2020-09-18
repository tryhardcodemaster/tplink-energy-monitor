import { HttpError } from 'http-errors';
import { Request, Response } from 'express';

import createHttpError = require('http-errors');
import express = require('express');
import path = require('path');
import expressWs = require('express-ws');
import hbs = require('hbs');
import cookieParser = require('cookie-parser');
import morgan = require('morgan');

const app = express();
const wsInstance = expressWs(app);

const indexRouter = require('./routes');
const wsRouter = require('./routes/ws');

// view engine setup
app.set('views', path.join(__dirname, './views'));
app.set('view engine', 'hbs');

hbs.registerPartials(path.join(__dirname, '/views/partials'));

app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/ws', wsRouter);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createHttpError(404));
});

// error handler
app.use((err: HttpError, req: Request, res: Response) => {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

app.listen(process.env.PORT || '3000');

module.exports.getWsClientCount = () => wsInstance.getWss().clients.size;

module.exports.getWsClients = () => wsInstance.getWss().clients;
