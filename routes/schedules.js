'use strict';
const express = require('express');
const router = express.Router();
const authenticationEnsurer = require('./authentication-ensurer');
const { v4: uuidv4 } = require('uuid');
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const User = require('../models/user');
const Availability = require('../models/availability');

router.get('/new', authenticationEnsurer, (req, res, next) => {
  res.render('new', { user: req.user });
});

router.post('/', authenticationEnsurer, async (req, res, next) => {
  const scheduleId = uuidv4();
  const updatedAt = new Date();
  const schedule = await Schedule.create({
    scheduleId: scheduleId,
    scheduleName: req.body.scheduleName.slice(0, 255) || '（名称未設定）',
    memo: req.body.memo,
    createdBy: req.user.id,
    updatedAt: updatedAt
  });
  const candidateNames = req.body.candidates.trim().split('\n').map((s) => s.trim()).filter((s) => s !== "");
  const candidates = candidateNames.map((c) => { return {
    candidateName: c,
    scheduleId: schedule.scheduleId
  };});
  await Candidate.bulkCreate(candidates);
  res.redirect('/schedules/' + schedule.scheduleId);
});

router.get('/:scheduleId', authenticationEnsurer, async (req, res, next) => {
  const schedule = await Schedule.findOne({
    include: [
      {
        model: User,
        attributes: ['userId', 'username']
      }],
    where: {
      scheduleId: req.params.scheduleId
    },
    order: [['updatedAt', 'DESC']]
  });
  if (schedule) {
    const candidates = await Candidate.findAll({
      where: { scheduleId: schedule.scheduleId },
      order: [['candidateId', 'ASC']]
    });

    //データベースからその予定の全ての出欠を取得する
    //ユーザ情報も欲しいので、AvailabilityテーブルとUserテーブルを結合して出欠を取得する
    const availabilities = await Availability.findAll({
      include: [
        {
          model: User,
          attributes: ['userId', 'username']
        }
      ],
      where: { scheduleId: schedule.scheduleId },  //予定IDで抽出するデータを絞り込む
      order: [[User, 'username', 'ASC'], ['candidateId', 'ASC']]
    });

    //出欠用のMapMap（キー:ユーザID, 値:出欠Map(キー:候補ID, 値:出欠)）を作成する
    //key: userId, value: Map(key: candidateId, value: availability) となるような二重Mapを作る
    const availabilityMapMap = new Map();  
    availabilities.forEach((a) => {
      const map = availabilityMapMap.get(a.user.userId) || new Map();
      map.set(a.candidateId, a.availability);
      availabilityMapMap.set(a.user.userId, map);
    });

    //閲覧ユーザと出欠に紐づくユーザからユーザMap(キー:ユーザID, 値:ユーザ)を作る
    //key: userId, value: User となるようなMapを作る
    //まずは閲覧ユーザ自身を加える
    const userMap = new Map();
    userMap.set(parseInt(req.user.id), {
      isSelf: true,  //閲覧ユーザかどうかのフラグ
      userId: parseInt(req.user.id),
      username: req.user.username
    });
    //さらに、出欠のデータを一つでも持っていたユーザもMapに追加する
    //出欠データを持つユーザは、Availabilitiesテーブルから持ってこれる
    availabilities.forEach((a) => {
      userMap.set(a.user.userId, {
        isSelf: parseInt(req.user.id) === a.user.userId,  //閲覧ユーザ自身であるかを含める
        userId: a.user.userId,
        username: a.user.username
      });
    });

    //全ユーザ、全候補で二重ループしてそれぞれの出欠の値がない場合には「欠席」を設定する
    //出欠情報を持つ全ユーザ・全候補で二重ループを実行し、出欠データを更新していき
    //出欠情報が存在しない場合は、デフォルト値の0を利用する（この0が欠席を表す）
    const users = Array.from(userMap).map((keyValue) => keyValue[1]);
    users.forEach((u) => {
      candidates.forEach((c) => {
        const map = availabilityMapMap.get(u.userId) || new Map();
        const a = map.get(c.candidateId) || 0;
        map.set(c.candidateId, a);
        availabilityMapMap.set(u.userId, map);
      });
    });

    // console.log(schedule);  //表示する予定データ
    // console.log(availabilities);  //表示する出欠データ
    // console.log(userMap);  //閲覧ユーザと出欠データをもつユーザ
    // console.log(users);  //userMapからユーザ情報のみ取得（userMapが持つユーザID以外の情報を取得）
    // console.log(availabilityMapMap);

    res.render('schedule', {
      user: req.user,
      schedule: schedule,
      candidates: candidates,
      users: users,
      availabilityMapMap: availabilityMapMap
    });
  } else {
    const err = new Error('指定された予定は見つかりません');
    err.status = 404;
    next(err);
  }
});

module.exports = router;