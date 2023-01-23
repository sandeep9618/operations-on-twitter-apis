const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());

let db = null;
const initializingDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000");
    });
  } catch (e) {
    console.log(e.message);
    process.exit(1);
  }
};

initializingDBAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserDetails = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserDetails);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const register = `INSERT INTO user(username,password,name,gender) 
      VALUES('${username}','${hashedPassword}','${name}','${gender}');`;
      await db.run(register);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// api 2 login

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user
   WHERE username = '${username}';`;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "my_secret_token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "my_secret_token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};
// api 3 twitter feed

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getSelectUserIdquery = `SELECT user_id FROM user 
   WHERE username = '${username}';`;
  const dbUser = await db.get(getSelectUserIdquery);

  const getTheFollowingIdsQuery = `SELECT following_user_id 
   FROM follower WHERE follower_user_id = '${dbUser.user_id}';`;
  const followingIdsResponse = await db.all(getTheFollowingIdsQuery);
  const followingIds = followingIdsResponse.map((eachFollowing) => {
    return eachFollowing.following_user_id;
  });

  const getTweetsQuery = `SELECT user.username,tweet.tweet,tweet.date_time as dateTime
  FROM user INNER JOIN tweet ON user.user_id = tweet.user_id 
  WHERE tweet.user_id IN(${followingIds}) 
  ORDER BY tweet.date_time DESC  
  LIMIT 4;`;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

// api 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectedUserQuery = `SELECT * FROM user 
  WHERE username = '${username}';`;
  const dbUser = await db.get(selectedUserQuery);
  const dbUserId = dbUser.user_id;
  console.log(dbUserId);
  const getUserFollowingQuery = `SELECT * FROM follower 
  WHERE  follower_user_id = '${dbUserId}';`;

  const followingUserList = await db.all(getUserFollowingQuery);
  const followingUserArray = followingUserList.map((eachFollower) => {
    return eachFollower.following_user_id;
  });

  const getUserNamesQuery = `select name from user 
  where user_id in(${followingUserArray});`;
  const userNamesResponse = await db.all(getUserNamesQuery);
  response.send(userNamesResponse);
});

// api 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const selectedUserQuery = `SELECT * FROM user 
  WHERE username = '${username}';`;
  const dbUser = await db.get(selectedUserQuery);
  const dbUserId = dbUser.user_id;
  console.log(dbUserId);

  const getUserFollowersQuery = `SELECT * FROM follower 
  WHERE  following_user_id = '${dbUserId}';`;

  const followingUserList = await db.all(getUserFollowersQuery);
  const followerUserArray = followingUserList.map((eachFollower) => {
    return eachFollower.follower_user_id;
  });
  const getUserNamesQuery = `select name from user 
  where user_id in(${followerUserArray});`;
  const userNamesResponse = await db.all(getUserNamesQuery);
  response.send(userNamesResponse);
});

// re usable code
const checkingTheUserFollowingUsersHavingTheIds = async (username, tweetId) => {
  const getUserIdQuery = `SELECT * FROM user 
    WHERE username = '${username}';`;
  const dbUser = await db.get(getUserIdQuery);
  const dbUserId = dbUser.user_id;

  const getUserFollowingIdsQuery = ` select * from follower
  where follower_user_id = ${dbUserId};`;
  const dbFollowingResponse = await db.all(getUserFollowingIdsQuery);
  const followingIds = dbFollowingResponse.map((eachFollower) => {
    return eachFollower.following_user_id;
  });
  // finding where the user following users has tweets or not
  const getTweetUserIds = ` select * from tweet 
  where user_id IN (${followingIds})`;

  const dbTweetUserIds = await db.all(getTweetUserIds);

  const tweetIds = dbTweetUserIds.map((eachTweet) => {
    return eachTweet.tweet_id;
  });
  return tweetIds;
};

// api 6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;

  const tweetIds = await checkingTheUserFollowingUsersHavingTheIds(
    username,
    tweetId
  );

  if (tweetIds.includes(parseInt(tweetId))) {
    const getUserPostedTweetsQuery = `SELECT tweet.tweet,
  count(like.user_id) as likes,
                (SELECT COUNT(reply.tweet_id)  
                FROM tweet inner join reply 
                on tweet.tweet_id = reply.tweet_id
                WHERE tweet.tweet_id = ${tweetId}
                ) as replies,

  tweet.date_time as dateTime

  FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
  
  WHERE tweet.tweet_id = ${tweetId}
  `;
    const getUserPostedTweetsArray = await db.get(getUserPostedTweetsQuery);
    response.send(getUserPostedTweetsArray);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const tweetIds = await checkingTheUserFollowingUsersHavingTheIds(
      username,
      tweetId
    );

    if (tweetIds.includes(parseInt(tweetId))) {
      const getTweetLikesQuery = `select user.username as username from 
        (tweet inner join like 
        on tweet.tweet_id = like.tweet_id) as t inner join user 
        on like.user_id = user.user_id
        WHERE tweet.tweet_id = ${tweetId}`;
      const dbResponse = await db.all(getTweetLikesQuery);
      response.send({
        likes: dbResponse.map((eachUser) => {
          return eachUser.username;
        }),
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const tweetIds = await checkingTheUserFollowingUsersHavingTheIds(
      username,
      tweetId
    );

    if (tweetIds.includes(parseInt(tweetId))) {
      const getTweetLikesQuery = `select user.name as name, 
      reply.reply as reply from 
        (tweet inner join reply 
        on tweet.tweet_id = reply.tweet_id) as t inner join user 
        on reply.user_id = user.user_id
        WHERE tweet.tweet_id = ${tweetId};`;
      const dbResponse = await db.all(getTweetLikesQuery);
      response.send({
        replies: dbResponse,
      });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserIdQuery = ` SELECT * FROM user
   WHERE username = '${username}';`;
  const dbUser = await db.get(getUserIdQuery);

  const getUserPostedTweetsQuery = `SELECT  userLike.tweet as tweet, count(distinct userLike.like_id)as likes ,
       count(distinct reply.reply_id) as replies,userLike.date_time as dateTime
   FROM
  (tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id) AS userLike
  INNER JOIN  reply ON userLike.tweet_id= reply.tweet_id
  WHERE userLike.user_id=${dbUser.user_id}
  GROUP BY userLike.tweet_id;
  
  `;
  const getUserPostedTweetsArray = await db.all(getUserPostedTweetsQuery);
  response.send(getUserPostedTweetsArray);
});

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;

  const userIdQuery = ` select * from user 
  where username = '${username}';`;
  const dbUser = await db.get(userIdQuery);

  const currentDate = new Date();
  const addDate = `${currentDate.getFullYear()}-${
    currentDate.getMonth() + 1
  }-${currentDate.getDate()} ${currentDate.getHours()}:${currentDate.getMinutes()}:${currentDate.getMinutes()}`;
  console.log(addDate);
  const insertingTweet = ` insert into tweet(tweet,user_id,date_time) 
  values('${tweet}',${dbUser.user_id},'${addDate}')`;
  await db.run(insertingTweet);
  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const getUserIdQuery = `select * from user where username = '${username}';`;
    const dbUser = await db.get(getUserIdQuery);

    const { tweetId } = request.params;

    const tweetIdsQuery = `select tweet_id from tweet where user_id = ${dbUser.user_id};`;
    const dbTweetIds = await db.all(tweetIdsQuery);
    const tweetIds = dbTweetIds.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });

    if (tweetIds.includes(parseInt(tweetId))) {
      const deleteQuery = `DELETE from tweet where tweet_id = ${tweetId}`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
