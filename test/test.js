'use strict';
const request = require('supertest');
const app = require('../app');
const passportStub = require('passport-stub');
const User = require('../models/user');
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const Availability = require('../models/availability');

describe('/login', () => {
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ username: 'testuser' });
  });

  afterAll(() => {
    passportStub.logout();
    passportStub.uninstall();
  });

  test('ログインのためのリンクが含まれる', async () => {
    await request(app)
      .get('/login')
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(/<a href="\/auth\/github"/)
      .expect(200);
  });

  test('ログイン時はユーザー名が表示される', async () => {
    await request(app)
      .get('/login')
      .expect(/testuser/)
      .expect(200);
  });
});

describe('/logout', () => {
  test('/ にリダイレクトされる', async () => {
    await request(app)
      .get('/logout')
      .expect('Location', '/')
      .expect(302);
  });
});

describe('/schedules', () => {
  let scheduleId = '';
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  afterAll(async () => {
    passportStub.logout();
    passportStub.uninstall();

    //テストで作成した予定と、そこに紐づく情報を削除するメソッドを呼び出している
    await deleteScheduleAggregate(scheduleId);
  });

  test('予定が作成でき、表示される', async () => {
    await User.upsert({ userId: 0, username: 'testuser' });
    const res = await request(app)
      .post('/schedules')
      .send({
        scheduleName: 'テスト予定1',
        memo: 'テストメモ1\r\nテストメモ2',
        candidates: 'テスト候補1\r\nテスト候補2\r\nテスト候補3'
      })
      .expect('Location', /schedules/)
      .expect(302)

    const createdSchedulePath = res.headers.location;
    scheduleId = createdSchedulePath.split('/schedules/')[1];
    await request(app)
      .get(createdSchedulePath)
      .expect(/テスト予定1/)
      .expect(/テストメモ1/)
      .expect(/テストメモ2/)
      .expect(/テスト候補1/)
      .expect(/テスト候補2/)
      .expect(/テスト候補3/)
      .expect(200)
  });
});

//出欠が更新できるかどうかのテスト
describe('/schedules/:scheduleId/users/:userId/candidates/:candidateId', () => {  //テストい利用するパスを指定
  let scheduleId = '';
  
  //テスト実施時のログイン処理
  beforeAll(() => {
    passportStub.install(app);
    passportStub.login({ id: 0, username: 'testuser' });
  });

  //テスト実施時のログアウト処理処理
  afterAll(async () => {
    passportStub.logout();
    passportStub.uninstall();
    await deleteScheduleAggregate(scheduleId);  //テスト実施時のログアウト時にもテスト用の予定などを削除
  });

  test('出欠が更新できる', async () => {

    //テスト用ユーザをUserテーブルに挿入
    await User.upsert({ userId: 0, username: 'testuser' });

    // パス/scheduleにテスト用の「予定」と「候補を」POST
    const res = await request(app)
        .post('/schedules')
        .send({ scheduleName: 'テスト出欠更新予定１', memo: 'テスト出欠更新メモ１', candidates: 'テスト出欠更新候補１' })

    //作成されたテスト用の予定データのURLを取得
    const createdSchedulePath = res.headers.location;

    //テスト用の予定データのURLから、スケジュールIDを取得
    scheduleId = createdSchedulePath.split('/schedules/')[1];

    //取得したスケジュールIDをもとに、Candidate（予定日）のデータを取得
    const candidate = await Candidate.findOne({
      where: { scheduleId: scheduleId }
    });

    //テスト用ユーザIDを設定
    const userId = 0;

    //出欠データが更新されるかどうかをテスト
    /* expectで一致しているかどうかの確認は、半角スペースも含めるで注意 */
    await request(app)
      .post(`/schedules/${scheduleId}/users/${userId}/candidates/${candidate.candidateId}`)
      .send({ availability:2 })  //出席に更新
      .expect('{"status":"OK","availability":2}')  
  });
});

//テストで作成した予定と、そこに紐づく情報を削除するメソッドを定義
async function deleteScheduleAggregate(scheduleId) {

  /* 親子関係のあるデータを削除していく場合、基本的に子から先に削除していく */

  //Availabilityテーブルから、scheduleIdをもとに全ての出欠を取得
  const availabilities = await Availability.findAll({
    where: { scheduleId: scheduleId }
  });

  //次に、上記で取得した全て出欠を削除（削除されるまでawaitで待つ）
  const promisesAvailabilityDestroy = availabilities.map((a) => { return a.destroy(); });
  await Promise.all(promisesAvailabilityDestroy);

  //さらに、Candidateテーブルから、scheduleIdをもとに全ての予定日を取得
  const candidates = await Candidate.findAll({
    where: { scheduleId: scheduleId }
  });

  //出欠の削除と同様に、予定日も削除していく
  const promisesCandidateDestroy = candidates.map((c) => { return c.destroy(); });
  await Promise.all(promisesCandidateDestroy);

  //そして最後に、予定を削除する
  const s = await Schedule.findByPk(scheduleId);
  await s.destroy();
}

