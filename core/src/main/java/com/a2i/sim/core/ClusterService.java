/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */

package com.a2i.sim.core;

import com.a2i.sim.util.NetworkUtil;
import com.a2i.sim.util.TimeUtil;
import com.a2i.sim.core.codec.GenericEncoder;
import com.a2i.sim.Parameters;
import java.io.IOException;
import java.util.Collection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 *
 * @author atrimble
 */
@Component
public class ClusterService {

    private static final String GOSSIP_PORT_PROPERTY = "com.a2i.port.gossip";
    private static final String DATA_PORT_PROPERTY = "com.a2i.port.data";

    @Autowired
    private MCDiscovery multicast;

    private MeMember me;

    private Gossiper gossiper;

    private static final Logger LOG = LoggerFactory.getLogger(ClusterService.class);

    public ClusterService() {
        
    }

    public <T> void addListener(String topic, MessageListener<T> consumer) {
        ListenerRegistry.INSTANCE.registerMemberForTopic(topic, me);
        ListenerRegistry.INSTANCE.addLocalListener(topic, consumer);
    }

    public <T> void removeListener(MessageListener<T> consumer) {
        ListenerRegistry.INSTANCE.removeLocalListener(consumer);
    }

    public void removeAllListeners(String topic) {
        ListenerRegistry.INSTANCE.removeAllLocalListeners(topic);
    }

    public <T> void sendMessage(String topic, T message) throws IOException {
        Envelope envelope = new Envelope();
        envelope.setDecoded(false);
        envelope.setExecuteTime(0);
        envelope.setMillisecondsSinceMidnight(TimeUtil.getMillisecondsSinceMidnight());
        envelope.setSenderKey(MemberKey.getKey(me));
        envelope.setTopic(topic);
        envelope.setClassName(message.getClass().getName());

        for(Member member : ListenerRegistry.INSTANCE.getRegisteredMembers(topic)) {
            
            if(me.equals(member)) {
                envelope.setMessage(message);
                envelope.setDecoded(true);
            } else {
                envelope.setPayload(GenericEncoder.encode(message));
                envelope.setDecoded(false);
            }

            member.send(envelope);
        }
    }

    public Collection<Member> getAllMembers() {
        return MemberHolder.INSTANCE.getAllMembers();
    }
    
    public Collection<Member> getActiveMembers() {
        return MemberHolder.INSTANCE.getActiveMembers();
    }
    
    public Collection<Member> getDeadMembers() {
        return MemberHolder.INSTANCE.getDeadMembers();
    }

    public Member getMe() {
        return me;
    }

    public void initialize() {

        String gossipPort = Parameters.INSTANCE.getProperty(GOSSIP_PORT_PROPERTY);
        String dataPort = Parameters.INSTANCE.getProperty(DATA_PORT_PROPERTY);

        int gossipPortInt;
        int dataPortInt;

        if(gossipPort == null) {
            LOG.debug("Finding a random port for gossiping.");
            gossipPortInt = NetworkUtil.getFreePort();
        } else {
            gossipPortInt = Integer.parseInt(gossipPort);
        }

        if(dataPort == null) {
            LOG.debug("Finding a random port for data.");
            dataPortInt = NetworkUtil.getFreePort();
        } else {
            dataPortInt = Integer.parseInt(dataPort);
        }

        String myAddress = NetworkUtil.getIp();

        if(LOG.isDebugEnabled()) {
            StringBuilder greeting = new StringBuilder();
            LOG.debug(greeting
                    .append("Greetings. I am ")
                    .append(myAddress)
                    .append(":")
                    .append(gossipPortInt)
                    .append(":")
                    .append(dataPortInt)
                    .toString());
        }

        me = new MeMember(myAddress, gossipPortInt, dataPortInt);
        me.setStatus(MemberStatus.Alive);
        me.initialize();
        MemberHolder.INSTANCE.updateMemberStatus(me);

        me.addGossipConsumer(new GossipListener() {
            @Override
            public void accept(GossipMessage message) {
                handleGossipMessage(message);
            }
        });

        multicast.initialize(me);

        gossiper = new Gossiper(me);

        Runtime.getRuntime().addShutdownHook(new Thread() {
            @Override
            public void run() {
                shutdown();
            }
        });
    }

    public void members() {
        for(Member member : getAllMembers()) {
            LOG.info(member.toString());
        }
    }

    public void join(String ip) {
        
    }

    public void leave() {
        
    }

    public void shutdown() {
        try {
            multicast.shutdown();
        } catch (InterruptedException ex) {
            LOG.warn("Interrupted while shutting down multicast agent.", ex);
        }

        for(Member member : MemberHolder.INSTANCE.getAllMembers()) {
            ((AbstractMember)member).shutdown();
        }
    }

    private void handleGossipMessage(GossipMessage message) {
        int mySequence = me.getSequence().get();
        int messageSequence = message.getSequence();

        if(messageSequence > mySequence) {
            // a new message
            int newSequence = Math.max(mySequence, messageSequence) + 1;
            me.getSequence().set(newSequence);

            for(String key : message.getMembers()) {
                Member m = MemberHolder.INSTANCE.getMember(key);
                if(m == null) {
                    m = MemberKey.decode(key);
                    ((AbstractMember)m).initialize();
                }

                MemberHolder.INSTANCE.updateMemberStatus(m);
            }

            for(String key : message.getListeners().keySet()) {
                ListenerRegistry.INSTANCE.registerMemberForTopic(
                        message.getListeners().get(key), 
                        MemberHolder.INSTANCE.getMember(key));
            }
        } 

        // else an old message - discard
    }
}
