using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EMS.Data.Models;

public class Customer
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int CustomerID { get; set; }

    [StringLength(50)]
    public string? Category { get; set; }

    [Required]
    [StringLength(255)]
    public string CompanyName { get; set; } = string.Empty;

    public string? Address1 { get; set; }

    public string? Address2 { get; set; }

    [StringLength(50)]
    public string? Rating { get; set; }

    [StringLength(50)]
    public string? Type { get; set; }

    [StringLength(50)]
    public string? FaxNo { get; set; }

    [StringLength(50)]
    public string? Phone1 { get; set; }

    [StringLength(50)]
    public string? Phone2 { get; set; }

    [StringLength(100)]
    public string? MailId { get; set; }

    [StringLength(100)]
    public string? Website { get; set; }

    [StringLength(20)]
    public string Status { get; set; } = "Active";
}
