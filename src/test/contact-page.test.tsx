import { describe, expect, it } from "vitest";
import { leadershipContacts } from "@/content/site";

function contactAt(index: number) {
  const contact = leadershipContacts[index];
  if (!contact) {
    throw new Error(`Missing leadership contact at index ${index}`);
  }
  return contact;
}

describe("leadership contacts data and links", () => {
  it("keeps Kunal Suri first in order and Suresh Mahto second", () => {
    expect(leadershipContacts).toHaveLength(2);

    expect(contactAt(0).name).toBe("Kunal Suri");
    expect(contactAt(0).role).toBe("Co-Founder & Manager – Operations");

    expect(contactAt(1).name).toBe("Suresh Mahto");
    expect(contactAt(1).role).toBe("Founder");
  });

  it("verifies both Kunal Suri numbers have call and WhatsApp links", () => {
    const kunal = contactAt(0);
    expect(kunal.name).toBe("Kunal Suri");
    const secondPhone = kunal.phones[1];
    if (!secondPhone) {
      throw new Error("Missing Kunal Suri's second phone number");
    }

    // First number: +91 99871 17974 (Has call feature and WhatsApp)
    expect(kunal.phones[0]).toEqual({
      raw: "+91 9987117974",
      display: "+91 99871 17974",
      telHref: "tel:+919987117974",
      whatsappHref: "https://wa.me/919987117974",
      allowCall: true,
    });

    // Second number: +91 84461 73577 (call and WhatsApp)
    expect(secondPhone).toEqual({
      raw: "+91 8446173577",
      display: "+91 84461 73577",
      telHref: "tel:+918446173577",
      whatsappHref: "https://wa.me/918446173577",
      allowCall: true,
    });
    expect(secondPhone.telHref).toBe("tel:+918446173577");

    expect(kunal.linkedin).toEqual({
      href: "https://linkedin.com/in/kunal-suri-569224408",
      label: "LinkedIn Profile",
    });
  });

  it("verifies Suresh Mahto's phone, tel, and WhatsApp links (both callable)", () => {
    const suresh = contactAt(1);
    expect(suresh.name).toBe("Suresh Mahto");
    expect(suresh.phones).toEqual([
      {
        raw: "+91 8779728005",
        display: "+91 87797 28005",
        telHref: "tel:+918779728005",
        whatsappHref: "https://wa.me/918779728005",
        allowCall: true,
      },
      {
        raw: "+91 9870821082",
        display: "+91 98708 21082",
        telHref: "tel:+919870821082",
        whatsappHref: "https://wa.me/919870821082",
        allowCall: true,
      },
    ]);
  });

  it("ensures Suresh Mahto has no LinkedIn profile listed", () => {
    const suresh = contactAt(1);
    expect(suresh.linkedin).toBeUndefined();
  });
});
