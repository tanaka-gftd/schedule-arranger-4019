/* 出欠更新用 */

'use strict';
const express = require('express');
const router = express.Router();
const authenticationEnsurer = require('./authentication-ensurer');
const Availability = require('../models/availability');

/* 
  パスから予定ID,ユーザID,候補IDを受け取り、
  POSTのリクエストに含まれるavailabilityプロパティで、データベースを更新する
*/
router.post(
  '/:scheduleId/users/:userId/candidates/:candidateId',
  authenticationEnsurer,  //データ更新を利用ずる際も認証を確認する
  async (req, res, next) => {
    const scheduleId = req.params.scheduleId;
    const userId = req.params.userId;
    const candidateId = req.params.candidateId;
    let availability = req.body.availability;
    availability = availability ? parseInt(availability) : 0;

    await Availability.upsert({
      scheduleId: scheduleId,
      userId: userId,
      candidateId: candidateId,
      availability: availability
    });

    //更新の確認を、レスポンスとして返す
    res.json({ status: 'OK', availability: availability });
  }
);

module.exports = router;