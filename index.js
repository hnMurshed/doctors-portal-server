const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000;

// use middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vnaqk.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const run = async () => {
  try {
    await client.connect();
    const serviceCollection = client.db('doctors_portal').collection('services');
    const bookingsCollection = client.db('doctors_portal').collection('bookings');
    const userCollection = client.db('doctors_portal').collection('users');
    const doctorCollection = client.db('doctors_portal').collection('doctors');

    const verifyToken = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized' });
      };

      const acceesToken = authHeader.split(' ')[1];
      jwt.verify(acceesToken, process.env.SECRET_ACCESS_TOKEN, function (err, decoded) {
        if (err) {
          return res.status(403).send({ message: 'Fobidden access' });
        };
        req.decoded = decoded;

        next();
      });
    };
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.user;
      const requesterAcount = await userCollection.findOne({ user: requester });

      if (requesterAcount.role === 'admin') {
        next();
      }
      else {
        res.status(403).send({ message: 'Fobidden' });
      }
    };

    app.get('/services', async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();

      res.send(services);
    });

    // load all services with only name field using mongo Project field method
    app.get('/service-names', async (req, res) => {
      const serviceNames = await serviceCollection.find().project({ 'name': 1 }).toArray();
      res.send(serviceNames);
    })

    app.post('/bookings', async (req, res) => {
      const newBooking = req.body;
      const query = { treatment: newBooking.treatment, appointmentDate: newBooking.appointmentDate, patientEmail: newBooking.patientEmail };
      const exits = await bookingsCollection.findOne(query);

      if (exits) {
        return res.send({ success: false, booking: exits });
      }

      const result = await bookingsCollection.insertOne(newBooking);
      res.send({ success: true, result });
    });

    app.get('/bookings', verifyToken, async (req, res) => {
      const patientEmail = req.query.patient;
      const userEmail = req.decoded.user;

      if (patientEmail === userEmail) {
        const query = { patientEmail: patientEmail };
        const bookings = await bookingsCollection.find(query).toArray();

        console.log(bookings);
        return res.send(bookings);
      }
      res.status(403).send({ message: 'Forbidden access' })
    })

    // get all services with available slots based on date
    // Note: this is not proper way to query
    // after learning more about mongodb, use aggregate, pipeline, match, group
    app.get('/available', async (req, res) => {
      const appointmentDate = req.query.appointmentDate;
      const services = await serviceCollection.find().toArray();

      // bookings on that day
      const query = { appointmentDate: appointmentDate };
      const bookings = await bookingsCollection.find(query).toArray();

      services.forEach(service => {
        const bookings4EachServiceOnTheDay = bookings.filter(booking => booking.treatment === service.name);
        const bookedSlots = bookings4EachServiceOnTheDay.map(s => s.slot);
        const availableSlots = service.slots.filter(s => !bookedSlots.includes(s));
        service.slots = availableSlots;
      })
      res.send(services);
    });

    app.put('/user', async (req, res) => {
      const user = req.body.user;
      const filter = { user: user };
      const options = { upsert: true };
      const updateDoc = {
        $set: { user: user }
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);

      // sending secret accestoken for user
      const privateKey = process.env.SECRET_ACCESS_TOKEN;
      const accessToken = jwt.sign({ user: user }, privateKey, { expiresIn: '1day' });
      result.accessToken = accessToken;
      res.send(result);

    });

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.put('/control-role', verifyToken, verifyAdmin, async (req, res) => {
      const user = req.body.user;
      const isAdmin = req.body.isAdmin;
      const filter = { user: user };
      const updateDoc = {
        $set: { 'role': isAdmin ? 'admin' : 'user' }
      };

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);

    });

    app.get('/admin', async (req, res) => {
      const email = req.headers.email;
      const user = await userCollection.findOne({ user: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin });
    });

    app.get('/doctors', verifyToken, verifyAdmin, async (req, res) => {
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    })

    app.post('/doctor', verifyToken, verifyAdmin, async (req, res) => {
      const newDoctor = req.body;
      const result = await doctorCollection.insertOne(newDoctor);
      res.send(result);
    });

    app.delete('/doctor/:email', verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const filter = {email};
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    });
  }
  finally {
    // await client.close()
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello from Doctors Portal!')
})

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`)
})